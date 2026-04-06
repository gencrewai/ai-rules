#!/usr/bin/env bash
# confirm-capture.sh — UserPromptSubmit hook
#
# Principles (09-hooks-guide.md):
#   Single responsibility / Injection defense / Always exit 0 (never block user messages)
#
# Behavior:
#   1. Extract user_message from stdin JSON
#   2. Detect "CONFIRM {action}-{YYYYMMDD}" pattern
#   3. Create .claude/confirmed-actions/{sanitized-action}-{date} file on detection
#   4. Always exit 0
#
# UserPromptSubmit stdin JSON structure:
#   {"session_id":"...","user_message":"..."}

# Not using set -e: must guarantee exit 0 even on failure
set -uo pipefail

# ── stdin JSON parsing (injection defense: absolutely no eval/exec) ────────────────────────
INPUT=$(cat)

USER_MESSAGE=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('user_message', ''))
except Exception:
    print('')
" 2>/dev/null) || \
USER_MESSAGE=$(printf '%s' "$INPUT" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  try { const o=JSON.parse(d); console.log((o.user_message)||''); }
  catch(e){ console.log(''); }
})" 2>/dev/null) || USER_MESSAGE=""

[[ -z "$USER_MESSAGE" ]] && exit 0

# ── Detect CONFIRM pattern ─────────────────────────────────────────────────────────
# Format: CONFIRM {action}-{YYYYMMDD}
# action: [A-Za-z0-9_-]+ / date: [0-9]{8}

CONFIRM_TOKEN=$(printf '%s' "$USER_MESSAGE" \
  | grep -oE '(^|[[:space:]])CONFIRM[[:space:]]+[A-Za-z0-9_-]+-[0-9]{8}([[:space:]]|$)' 2>/dev/null \
  | head -1 \
  | grep -oE 'CONFIRM[[:space:]]+[A-Za-z0-9_-]+-[0-9]{8}' \
  || echo "")

[[ -z "$CONFIRM_TOKEN" ]] && exit 0

# Remove "CONFIRM " prefix
PAYLOAD=$(printf '%s' "$CONFIRM_TOKEN" | sed 's/^CONFIRM[[:space:]]*//')
[[ -z "$PAYLOAD" ]] && exit 0

# ── Injection defense: split action/date and sanitize each ─────────────────────────
DATE_PART=$(printf '%s' "$PAYLOAD" | grep -oE '[0-9]{8}$' || echo "")
ACTION_PART=$(printf '%s' "$PAYLOAD" | sed 's/-[0-9]\{8\}$//' || echo "")

[[ -z "$DATE_PART" || -z "$ACTION_PART" ]] && exit 0

# Only allowed charset passes → path traversal fully blocked
SAFE_ACTION=$(printf '%s' "$ACTION_PART" | tr -cd 'a-zA-Z0-9_-')
SAFE_DATE=$(printf '%s' "$DATE_PART" | tr -cd '0-9' | head -c 8)

[[ -z "$SAFE_ACTION" || ${#SAFE_DATE} -ne 8 ]] && exit 0

FILENAME="${SAFE_ACTION}-${SAFE_DATE}"

# ── Determine project root ────────────────────────────────────────────────────────
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
[[ -z "$PROJECT_ROOT" ]] && PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-}"
if [[ -z "$PROJECT_ROOT" ]]; then
  printf '[confirm-capture] WARNING: no git root, using %s/.claude\n' "$HOME" >&2
  PROJECT_ROOT="$HOME"
fi

CONFIRMED_DIR="${PROJECT_ROOT}/.claude/confirmed-actions"

# ── Create directory and write token file ─────────────────────────────────────────
if ! mkdir -p "$CONFIRMED_DIR" 2>/dev/null; then
  printf '[confirm-capture] ERROR: directory creation failed: %s\n' "$CONFIRMED_DIR" >&2
  exit 0
fi

CONFIRM_FILE="${CONFIRMED_DIR}/${FILENAME}"

SESSION_ID=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try: print(json.load(sys.stdin).get('session_id','unknown'))
except: print('unknown')
" 2>/dev/null || echo "unknown")

if printf 'confirmed_at=%s\nsession=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date)" \
    "$SESSION_ID" \
    > "$CONFIRM_FILE" 2>/dev/null; then
  printf '[confirm-capture] CONFIRM recorded: %s\n' "$FILENAME" >&2
else
  printf '[confirm-capture] ERROR: file write failed: %s\n' "$CONFIRM_FILE" >&2
fi

# ── Always exit 0 ──────────────────────────────────────────────────────────────
exit 0
