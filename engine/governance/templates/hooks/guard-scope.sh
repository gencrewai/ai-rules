#!/usr/bin/env bash
# guard-scope.sh — PreToolUse(Edit|Write) out-of-scope edit guard
#
# Principles (09-hooks-guide.md):
#   Single responsibility / Fail fast / Clear messages / Idempotent / Injection defense
#
# exit 0 = allow
# exit 2 = block (Claude Code: feed message back to agent so it asks the user)
#
# Behavior — implements 05-responses Out-of-Scope Edit Disclosure triggers A & B:
#   Trigger A: target file is outside the current working directory (cross-project edit)
#   Trigger B: target file is shared infrastructure (core/, tools/, adapters/, root config)
#
# Trigger C (unmentioned files) is advisory-only — cannot be detected from tool input alone.

set -euo pipefail

# ── stdin JSON parsing (injection defense: absolutely no eval/exec) ────────────
INPUT=$(cat)

FILE_PATH=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {}) or {}
    # Edit / Write / NotebookEdit all use 'file_path'
    print(ti.get('file_path', '') or ti.get('notebook_path', ''))
except Exception:
    print('')
" 2>/dev/null) || \
FILE_PATH=$(printf '%s' "$INPUT" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  try {
    const o = JSON.parse(d);
    const ti = o.tool_input || {};
    console.log(ti.file_path || ti.notebook_path || '');
  } catch(e) { console.log(''); }
})" 2>/dev/null) || FILE_PATH=""

[[ -z "$FILE_PATH" ]] && exit 0

# ── Normalize paths ────────────────────────────────────────────────────────────
# Returns: "<normalized_target>|<normalized_cwd>|<relative_or_OUTSIDE>"
# Try python3, then python, then node (Windows often only has python or node).
PY_SCRIPT='
import os, sys
p = sys.argv[1]
cwd = os.path.realpath(os.getcwd())
if not os.path.isabs(p):
    p = os.path.join(cwd, p)
target = os.path.realpath(p)
try:
    rel = os.path.relpath(target, cwd)
    if rel.startswith(".."):
        rel = "OUTSIDE"
except ValueError:
    rel = "OUTSIDE"
print(target.replace(chr(92),"/") + "|" + cwd.replace(chr(92),"/") + "|" + rel.replace(chr(92),"/"))
'

NORMALIZED_PAIR=""
if command -v python3 >/dev/null 2>&1; then
  NORMALIZED_PAIR=$(python3 -c "$PY_SCRIPT" "$FILE_PATH" 2>/dev/null) || NORMALIZED_PAIR=""
fi
if [[ -z "$NORMALIZED_PAIR" ]] && command -v python >/dev/null 2>&1; then
  NORMALIZED_PAIR=$(python -c "$PY_SCRIPT" "$FILE_PATH" 2>/dev/null) || NORMALIZED_PAIR=""
fi
if [[ -z "$NORMALIZED_PAIR" ]] && command -v node >/dev/null 2>&1; then
  NORMALIZED_PAIR=$(node -e "
const path = require('path');
const p = process.argv[1];
const cwd = path.resolve(process.cwd());
const abs = path.isAbsolute(p) ? p : path.join(cwd, p);
const target = path.resolve(abs);
let rel = path.relative(cwd, target);
if (rel.startsWith('..') || path.isAbsolute(rel)) rel = 'OUTSIDE';
const fwd = s => s.split(path.sep).join('/');
console.log(fwd(target) + '|' + fwd(cwd) + '|' + fwd(rel));
" "$FILE_PATH" 2>/dev/null) || NORMALIZED_PAIR=""
fi
[[ -z "$NORMALIZED_PAIR" ]] && NORMALIZED_PAIR="$FILE_PATH||OUTSIDE"

NORMALIZED="${NORMALIZED_PAIR%%|*}"
REST="${NORMALIZED_PAIR#*|}"
CWD="${REST%%|*}"
RELATIVE="${REST#*|}"

# ── Trigger A: cross-project edit ──────────────────────────────────────────────
TRIGGER=""

if [[ "$RELATIVE" == "OUTSIDE" ]]; then
  TRIGGER="A"
fi

# ── Trigger B: shared infrastructure inside cwd ────────────────────────────────
if [[ -z "$TRIGGER" && -n "$RELATIVE" ]]; then
  # Sensitive top-level directories
  case "$RELATIVE" in
    core/*|tools/*|adapters/*|engine/*|.github/*)
      TRIGGER="B"
      ;;
  esac

  # Sensitive root config files (only if no trigger yet)
  if [[ -z "$TRIGGER" ]]; then
    BASENAME=$(basename "$RELATIVE")
    case "$BASENAME" in
      package.json|package-lock.json|pnpm-lock.yaml|yarn.lock|\
      tsconfig.json|tsconfig.*.json|\
      pyproject.toml|poetry.lock|requirements.txt|\
      Cargo.toml|Cargo.lock|go.mod|go.sum|\
      Makefile|Dockerfile|docker-compose.yml|docker-compose.yaml)
        # Only flag root-level config (not nested e.g. packages/*/package.json — those are scoped)
        case "$RELATIVE" in
          */*) ;;  # nested — allow
          *) TRIGGER="B-root-config" ;;
        esac
        ;;
    esac
  fi
fi

[[ -z "$TRIGGER" ]] && exit 0

# ── Check for confirmation token ───────────────────────────────────────────────
# If user has explicitly confirmed this scope in the current session, allow.
# Confirmation file written by user or by an upstream confirm-capture hook.
CONFIRM_FILE=".claude/confirmed-actions/scope-confirmed"
if [[ -f "$CONFIRM_FILE" ]]; then
  exit 0
fi

# ── Block with clear message ───────────────────────────────────────────────────
case "$TRIGGER" in
  A)
    cat <<EOF

⚠️ [guard-scope] Cross-project edit detected — confirmation required

Target: $FILE_PATH
Resolved: $NORMALIZED
Current working directory: $CWD

This file is OUTSIDE the current project. Per 05-responses
Out-of-Scope Edit Disclosure (Trigger A), the agent must:
  1. Tell the user the exact path it intends to edit
  2. Get an explicit "yes" in the same turn
  3. Only then proceed

Agent action: stop, report the path to the user, ask for explicit
confirmation before retrying.

To bypass for this session (after explicit user approval):
  mkdir -p .claude/confirmed-actions && touch .claude/confirmed-actions/scope-confirmed
EOF
    ;;
  B)
    cat <<EOF

⚠️ [guard-scope] Shared infrastructure edit detected — confirmation required

Target: $RELATIVE
Resolved: $NORMALIZED

This file is in a shared infrastructure directory (core/, tools/,
adapters/, engine/, or .github/). Edits here propagate to every
downstream project on next sync.

Per 05-responses Out-of-Scope Edit Disclosure (Trigger B), the agent
must:
  1. Tell the user the exact path it intends to edit
  2. Get an explicit "yes" in the same turn
  3. Only then proceed

Agent action: stop, report the path to the user, ask for explicit
confirmation before retrying.

To bypass for this session (after explicit user approval):
  mkdir -p .claude/confirmed-actions && touch .claude/confirmed-actions/scope-confirmed
EOF
    ;;
  B-root-config)
    cat <<EOF

⚠️ [guard-scope] Root config edit detected — confirmation required

Target: $RELATIVE

This is a root-level configuration file (package.json, tsconfig,
Dockerfile, etc.). Changes affect the whole project.

Per 05-responses Out-of-Scope Edit Disclosure (Trigger B), the agent
must get explicit user confirmation before editing.

Agent action: stop, report the path, ask the user.
EOF
    ;;
esac

exit 2
