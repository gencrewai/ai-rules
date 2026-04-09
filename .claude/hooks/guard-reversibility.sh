#!/usr/bin/env bash
# guard-reversibility.sh — PreToolUse(Bash) R2 reversibility guard
#
# Principles (09-hooks-guide.md):
#   Single responsibility / Fail fast / Clear messages / Idempotent / Injection defense
#
# exit 0 = allow
# exit 2 = block (Claude Code: block with message to agent)
#
# Behavior priority:
#   1. If .ai-governance/safety-manifest.yaml exists → use manifest-based patterns
#   2. If no manifest → use hardcoded fallback patterns

set -u

# ── stdin JSON parsing (injection defense: absolutely no eval/exec) ────────────────────────
INPUT=$(cat 2>/dev/null || true)
[[ -z "$INPUT" ]] && exit 0

# Parse command from JSON input (node preferred, python3 fallback)
COMMAND=$(printf '%s' "$INPUT" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  try { const o=JSON.parse(d); console.log((o.tool_input||{}).command||''); }
  catch(e){ console.log(''); }
})" 2>/dev/null) || \
COMMAND=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null) || true
COMMAND=${COMMAND:-""}

[[ -z "$COMMAND" ]] && exit 0

# ── Attempt manifest load ────────────────────────────────────────────────────────
MANIFEST=".ai-governance/safety-manifest.yaml"
BLOCK_REASON=""
APPROVAL=""
CONFIRM_ACTION=""

load_manifest_patterns() {
  # Parse manifest high_risk_actions with python3 then pattern match
  python3 - "$COMMAND" <<'PYEOF' 2>/dev/null
import sys, re

cmd = sys.argv[1] if len(sys.argv) > 1 else ""

try:
    import yaml
    with open(".ai-governance/safety-manifest.yaml", "r") as f:
        manifest = yaml.safe_load(f)
except Exception:
    sys.exit(10)  # manifest load failed → fallback signal

# Check never_override first (unconditional block)
for item in manifest.get("never_override", []):
    pattern = item.get("pattern", "")
    if pattern and re.search(pattern, cmd, re.IGNORECASE):
        print(f"BLOCK|{item.get('id','unknown')}|{item.get('message','Absolutely forbidden command')}|")
        sys.exit(0)

# Check high_risk_actions
for action in manifest.get("high_risk_actions", []):
    pattern = action.get("pattern", "")
    if not pattern:
        continue
    # Special handling for DELETE FROM without WHERE
    if action.get("id") == "delete-without-where":
        if re.search(r'DELETE\s+FROM\b', cmd, re.IGNORECASE) and \
           not re.search(r'\bWHERE\b', cmd, re.IGNORECASE):
            approval = action.get("approval", "confirm")
            confirm_name = action.get("confirm_action_name", action["id"])
            print(f"{approval.upper()}|{action['id']}|{action.get('message','')}|{confirm_name}")
            sys.exit(0)
        continue
    if re.search(pattern, cmd, re.IGNORECASE | re.DOTALL):
        approval = action.get("approval", "confirm")
        confirm_name = action.get("confirm_action_name", action.get("id","action"))
        print(f"{approval.upper()}|{action['id']}|{action.get('message','')}|{confirm_name}")
        sys.exit(0)

sys.exit(0)
PYEOF
}

MANIFEST_RESULT=""
if [[ -f "$MANIFEST" ]]; then
  MANIFEST_RESULT=$(load_manifest_patterns 2>/dev/null || echo "FALLBACK")
fi

# ── Parse manifest results ────────────────────────────────────────────────────────
if [[ -n "$MANIFEST_RESULT" && "$MANIFEST_RESULT" != "FALLBACK" ]]; then
  IFS='|' read -r APPROVAL ACTION_ID BLOCK_REASON CONFIRM_ACTION <<< "$MANIFEST_RESULT"
else
  # ── Fallback hardcoded patterns (when no manifest) ─────────────────────────────
  # Injection defense: store in variable and only perform grep pattern checks

  # 1. DELETE FROM without WHERE
  if printf '%s' "$COMMAND" | grep -qiE 'DELETE[[:space:]]+FROM[[:space:]]'; then
    if ! printf '%s' "$COMMAND" | grep -qiE '[[:space:]]WHERE[[:space:]]'; then
      BLOCK_REASON="DELETE FROM without WHERE — risk of deleting entire table"
      APPROVAL="CONFIRM"
      CONFIRM_ACTION="delete-all-rows"
    fi
  fi

  # 2. TRUNCATE
  if [[ -z "$BLOCK_REASON" ]]; then
    if printf '%s' "$COMMAND" | grep -qiE '[[:space:]]TRUNCATE[[:space:]]|^TRUNCATE[[:space:]]'; then
      BLOCK_REASON="TRUNCATE — deletes all data in table"
      APPROVAL="CONFIRM"
      CONFIRM_ACTION="truncate-table"
    fi
  fi

  # 3. DROP DATABASE / DROP TABLE
  if [[ -z "$BLOCK_REASON" ]]; then
    if printf '%s' "$COMMAND" | grep -qiE 'DROP[[:space:]]+(DATABASE|TABLE|SCHEMA)\b'; then
      BLOCK_REASON="DROP DATABASE/TABLE — schema destruction"
      APPROVAL="BLOCK"
      CONFIRM_ACTION=""
    fi
  fi

  # 4. prisma migrate reset
  if [[ -z "$BLOCK_REASON" ]]; then
    if printf '%s' "$COMMAND" | grep -qE 'prisma[[:space:]]+migrate[[:space:]]+reset'; then
      BLOCK_REASON="prisma migrate reset — full DB reset"
      APPROVAL="CONFIRM"
      CONFIRM_ACTION="migrate-reset"
    fi
  fi

  # 5. prisma db push --force-reset
  if [[ -z "$BLOCK_REASON" ]]; then
    if printf '%s' "$COMMAND" | grep -qE 'prisma[[:space:]]+db[[:space:]]+push.*--force-reset'; then
      BLOCK_REASON="prisma db push --force-reset — forced DB reset"
      APPROVAL="CONFIRM"
      CONFIRM_ACTION="db-force-reset"
    fi
  fi

  # 6. alembic downgrade
  if [[ -z "$BLOCK_REASON" ]]; then
    if printf '%s' "$COMMAND" | grep -qE 'alembic[[:space:]]+downgrade'; then
      BLOCK_REASON="alembic downgrade — migration rollback (possible data loss)"
      APPROVAL="CONFIRM"
      CONFIRM_ACTION="alembic-downgrade"
    fi
  fi

  # 7. git push --force / -f
  if [[ -z "$BLOCK_REASON" ]]; then
    if printf '%s' "$COMMAND" | grep -qE 'git[[:space:]]+push\b.*(--force|-f)\b'; then
      BLOCK_REASON="git push --force — remote history destruction"
      APPROVAL="BLOCK"
      CONFIRM_ACTION=""
    fi
  fi
fi

# ── Pass if no block ──────────────────────────────────────────────────────────
[[ -z "$BLOCK_REASON" ]] && exit 0

# ── Block handling (message varies by approval type) ──────────────────────────────
TODAY=$(date +%Y%m%d 2>/dev/null || echo "TODAY")

# Determine project root (used for CONFIRM token file path)
_PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
[[ -z "$_PROJECT_ROOT" ]] && _PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
_CONFIRMED_DIR="${_PROJECT_ROOT}/.claude/confirmed-actions"

case "$APPROVAL" in
  BLOCK)
    cat <<EOF

❌ [guard-reversibility] Absolutely forbidden command — blocked

Reason: $BLOCK_REASON
Command: $COMMAND

This command is permanently forbidden for agent execution per 07-db / 01-git rules.
The user must execute it manually in the terminal.
EOF
    exit 2
    ;;

  CONFIRM)
    # ── Check confirmed-actions token file (single use) ──────────────────────────
    # Injection defense: CONFIRM_ACTION is read from manifest but sanitized before path use
    _SAFE_CA=$(printf '%s' "$CONFIRM_ACTION" | tr -cd 'a-zA-Z0-9_-')
    _CONFIRM_FILE="${_CONFIRMED_DIR}/${_SAFE_CA}-${TODAY}"

    if [[ -n "$_SAFE_CA" && -f "$_CONFIRM_FILE" ]]; then
      # Token consumed (deleted after single use) → pass
      rm -f "$_CONFIRM_FILE" 2>/dev/null || true
      printf '[guard-reversibility] CONFIRM verified, passing: %s-%s\n' "$_SAFE_CA" "$TODAY" >&2
      exit 0
    fi

    # No token → block + CONFIRM instruction
    cat <<EOF

⚠️  [guard-reversibility] R2 irreversible action — blocked

Reason: $BLOCK_REASON
Command: $COMMAND

This action is irreversible (03-security reversibility R2 tier).

To continue, the user must type the exact phrase below in the conversation:
  CONFIRM ${CONFIRM_ACTION}-${TODAY}

Once done, the agent can retry and it will pass.
(If the agent retries without CONFIRM, it will be blocked again)
EOF
    exit 2
    ;;

  WARN)
    cat <<EOF

⚠️  [guard-reversibility] R1 caution action — blocked

Reason: $BLOCK_REASON
Command: $COMMAND

Reversible but costly (R1 tier).
Proceed after user approval.
EOF
    exit 2
    ;;

  *)
    # Unknown approval type → conservative block
    cat <<EOF

⚠️  [guard-reversibility] Dangerous command detected — blocked

Reason: $BLOCK_REASON
Command: $COMMAND

Proceed after user confirmation.
EOF
    exit 2
    ;;
esac
