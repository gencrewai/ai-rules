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
# Sensitive paths are loaded from .ai-governance/safety-manifest.yaml
# (out_of_scope.shared_dirs / root_config_files). If manifest is missing or
# the section is absent, fall back to hardcoded defaults.

SHARED_DIRS=""
ROOT_CONFIGS=""
MANIFEST=".ai-governance/safety-manifest.yaml"

if [[ -f "$MANIFEST" ]]; then
  PY_MANIFEST_SCRIPT='
try:
    import yaml
    with open(".ai-governance/safety-manifest.yaml", "r") as f:
        m = yaml.safe_load(f) or {}
    oos = m.get("out_of_scope", {}) or {}
    print("DIRS:" + " ".join(oos.get("shared_dirs", []) or []))
    print("ROOT:" + " ".join(oos.get("root_config_files", []) or []))
except Exception:
    pass
'
  MANIFEST_PARSED=""
  if command -v python3 >/dev/null 2>&1; then
    MANIFEST_PARSED=$(python3 -c "$PY_MANIFEST_SCRIPT" 2>/dev/null) || MANIFEST_PARSED=""
  fi
  if [[ -z "$MANIFEST_PARSED" ]] && command -v python >/dev/null 2>&1; then
    MANIFEST_PARSED=$(python -c "$PY_MANIFEST_SCRIPT" 2>/dev/null) || MANIFEST_PARSED=""
  fi
  # Node fallback uses a tiny YAML subset parser (only flat lists under out_of_scope)
  if [[ -z "$MANIFEST_PARSED" ]] && command -v node >/dev/null 2>&1; then
    MANIFEST_PARSED=$(node -e "
const fs = require('fs');
try {
  const txt = fs.readFileSync('.ai-governance/safety-manifest.yaml', 'utf8');
  const lines = txt.split(/\r?\n/);
  let section = null, sub = null;
  const dirs = [], roots = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+\$/, '');
    if (/^out_of_scope:\s*\$/.test(line)) { section = 'oos'; sub = null; continue; }
    if (section === 'oos') {
      if (/^[A-Za-z]/.test(line)) { section = null; continue; } // left section
      if (/^\s{2}shared_dirs:\s*\$/.test(line)) { sub = 'dirs'; continue; }
      if (/^\s{2}root_config_files:\s*\$/.test(line)) { sub = 'roots'; continue; }
      const m = line.match(/^\s{4}-\s+(.+?)\s*\$/);
      if (m) {
        const v = m[1].replace(/^['\"]|['\"]\$/g, '');
        if (sub === 'dirs') dirs.push(v);
        else if (sub === 'roots') roots.push(v);
      }
    }
  }
  console.log('DIRS:' + dirs.join(' '));
  console.log('ROOT:' + roots.join(' '));
} catch (e) {}
" 2>/dev/null) || MANIFEST_PARSED=""
  fi
  if [[ -n "$MANIFEST_PARSED" ]]; then
    _DIRS=$(printf '%s\n' "$MANIFEST_PARSED" | grep '^DIRS:' | sed 's/^DIRS://')
    _ROOTS=$(printf '%s\n' "$MANIFEST_PARSED" | grep '^ROOT:' | sed 's/^ROOT://')
    # Only override defaults if manifest provided non-empty values
    [[ -n "$_DIRS" ]] && SHARED_DIRS="$_DIRS"
    [[ -n "$_ROOTS" ]] && ROOT_CONFIGS="$_ROOTS"
  fi
fi

# Fallback defaults when manifest is missing or empty
[[ -z "$SHARED_DIRS" ]] && SHARED_DIRS="core tools adapters engine .github"
[[ -z "$ROOT_CONFIGS" ]] && ROOT_CONFIGS="package.json package-lock.json pnpm-lock.yaml yarn.lock tsconfig.json pyproject.toml poetry.lock requirements.txt Cargo.toml Cargo.lock go.mod go.sum Makefile Dockerfile docker-compose.yml docker-compose.yaml"

if [[ -z "$TRIGGER" && -n "$RELATIVE" ]]; then
  # Sensitive top-level directories
  for d in $SHARED_DIRS; do
    case "$RELATIVE" in
      "$d"/*|"$d")
        TRIGGER="B"
        break
        ;;
    esac
  done

  # Sensitive root config files (only if no trigger yet)
  if [[ -z "$TRIGGER" ]]; then
    case "$RELATIVE" in
      */*) ;;  # nested — allow (e.g. packages/foo/package.json)
      *)
        BASENAME="$RELATIVE"
        for cfg in $ROOT_CONFIGS; do
          # Support glob patterns like tsconfig.*.json via case match
          case "$BASENAME" in
            $cfg)
              TRIGGER="B-root-config"
              break
              ;;
          esac
        done
        ;;
    esac
  fi
fi

[[ -z "$TRIGGER" ]] && exit 0

# ── Check for confirmation token (single-use OR batch) ────────────────────────
# Single-use token (matches guard-reversibility):
#   scope-cross-project-{YYYYMMDD}
#   scope-shared-infra-{YYYYMMDD}
#   scope-root-config-{YYYYMMDD}
# Batch token (this hook only — guard-reversibility doesn't have batch):
#   scope-cross-project-batchN-{YYYYMMDD}    where N = 2..99
#   scope-shared-infra-batchN-{YYYYMMDD}
#   scope-root-config-batchN-{YYYYMMDD}
# Batch tokens carry "uses_remaining=K" inside the file. On match, K is
# decremented; the file is deleted when K reaches 0.
case "$TRIGGER" in
  A)              CONFIRM_NAME="scope-cross-project" ;;
  B)              CONFIRM_NAME="scope-shared-infra" ;;
  B-root-config)  CONFIRM_NAME="scope-root-config" ;;
  *)              CONFIRM_NAME="scope-unknown" ;;
esac

TODAY=$(date +%Y%m%d 2>/dev/null || echo "TODAY")

_PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
[[ -z "$_PROJECT_ROOT" ]] && _PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
_CONFIRMED_DIR="${_PROJECT_ROOT}/.claude/confirmed-actions"

# 1) Single-use token first
_SINGLE_FILE="${_CONFIRMED_DIR}/${CONFIRM_NAME}-${TODAY}"
if [[ -f "$_SINGLE_FILE" ]]; then
  rm -f "$_SINGLE_FILE" 2>/dev/null || true
  printf '[guard-scope] CONFIRM single-use verified, passing: %s-%s\n' "$CONFIRM_NAME" "$TODAY" >&2
  exit 0
fi

# 2) Batch token (look for any matching scope-{name}-batchN-{date})
# Token file is created by confirm-capture from "CONFIRM scope-{name}-batchN-{date}"
# and contains only metadata (confirmed_at, session) — no uses_remaining yet.
# On first match, we initialize uses_remaining=N (parsed from filename).
# Each subsequent match decrements; file is deleted when remaining reaches 0.
if [[ -d "$_CONFIRMED_DIR" ]]; then
  for _batch_file in "$_CONFIRMED_DIR/${CONFIRM_NAME}"-batch*-"${TODAY}"; do
    [[ -f "$_batch_file" ]] || continue
    _basename=$(basename "$_batch_file")
    # Extract N from "...-batchN-YYYYMMDD"
    _n=$(printf '%s' "$_basename" | sed -nE 's/^.*-batch([0-9]+)-[0-9]{8}$/\1/p')
    [[ -z "$_n" || "$_n" -lt 2 || "$_n" -gt 99 ]] && _n=2  # safety bounds
    # Read existing uses_remaining or initialize from filename N
    # (|| true protects against set -e when grep finds no match)
    _uses=$( (grep -E '^uses_remaining=' "$_batch_file" 2>/dev/null || true) | head -1 | sed 's/^uses_remaining=//' | tr -cd '0-9')
    if [[ -z "$_uses" ]]; then
      # First use of this batch token — initialize from N
      _uses="$_n"
    fi
    if [[ "$_uses" -gt 1 ]]; then
      _new=$((_uses - 1))
      # Append/update uses_remaining line atomically
      _tmp="${_batch_file}.tmp"
      grep -v '^uses_remaining=' "$_batch_file" 2>/dev/null > "$_tmp" || true
      printf 'uses_remaining=%d\n' "$_new" >> "$_tmp"
      mv "$_tmp" "$_batch_file" 2>/dev/null || rm -f "$_tmp"
      printf '[guard-scope] CONFIRM batch verified, %d uses remaining: %s\n' "$_new" "$_basename" >&2
    else
      rm -f "$_batch_file" 2>/dev/null || true
      printf '[guard-scope] CONFIRM batch consumed (last use): %s\n' "$_basename" >&2
    fi
    exit 0
  done
fi

# ── Block with clear message ───────────────────────────────────────────────────
case "$TRIGGER" in
  A)
    cat <<EOF

⚠️  [guard-scope] Cross-project edit detected — confirmation required

Target: $FILE_PATH
Resolved: $NORMALIZED
Current working directory: $CWD

This file is OUTSIDE the current project (Trigger A,
05-responses Out-of-Scope Edit Disclosure).

To allow ONE such edit, the user must type the exact phrase:
  CONFIRM ${CONFIRM_NAME}-${TODAY}

For a BATCH of N edits in the same task (2..99), the user can type:
  CONFIRM ${CONFIRM_NAME}-batchN-${TODAY}     (e.g. batch5)
This permits N Edit/Write calls before requiring a new CONFIRM.

Both token forms expire automatically tomorrow.
EOF
    ;;
  B)
    cat <<EOF

⚠️  [guard-scope] Shared infrastructure edit detected — confirmation required

Target: $RELATIVE
Resolved: $NORMALIZED

This file is in a shared infrastructure directory (core/, tools/,
adapters/, engine/, or .github/). Edits here propagate to every
downstream project on next sync.

Single-use form:
  CONFIRM ${CONFIRM_NAME}-${TODAY}
Batch form (2..99 edits):
  CONFIRM ${CONFIRM_NAME}-batchN-${TODAY}     (e.g. batch5)

Both token forms expire automatically tomorrow.
EOF
    ;;
  B-root-config)
    cat <<EOF

⚠️  [guard-scope] Root config edit detected — confirmation required

Target: $RELATIVE

This is a root-level configuration file (package.json, tsconfig,
Dockerfile, etc.). Changes affect the whole project.

Single-use form:
  CONFIRM ${CONFIRM_NAME}-${TODAY}
Batch form (2..99 edits):
  CONFIRM ${CONFIRM_NAME}-batchN-${TODAY}     (e.g. batch5)
EOF
    ;;
esac

exit 2
