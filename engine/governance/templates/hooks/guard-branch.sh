#!/usr/bin/env bash
# guard-branch.sh — PreToolUse(Bash) protected branch direct commit guard
#
# Principles (09-hooks-guide.md):
#   Single responsibility / Fail fast / Clear messages / Idempotent / Injection defense
#
# exit 0 = allow
# exit 2 = block (Claude Code: block with message to agent)
#
# Behavior:
#   1. Extract command from stdin JSON
#   2. Detect `git commit` command
#   3. Block if current branch is protected (main/master/develop or per safety-manifest)
#   4. Pass immediately if not a git commit

set -euo pipefail

# ── stdin JSON parsing (injection defense: absolutely no eval/exec) ────────────────────────
INPUT=$(cat)

COMMAND=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null) || \
COMMAND=$(printf '%s' "$INPUT" | node -e "
let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
  try { const o=JSON.parse(d); console.log((o.tool_input||{}).command||''); }
  catch(e){ console.log(''); }
})" 2>/dev/null) || COMMAND=""

[[ -z "$COMMAND" ]] && exit 0

# ── Check if command is git commit ──────────────────────────────────────────────────
# Detect `git commit` or `git commit -m ...` patterns
# Also includes `git commit --amend` (amending is also forbidden on protected branches)
if ! printf '%s' "$COMMAND" | grep -qE '(^|[[:space:]])git[[:space:]]+commit\b'; then
  exit 0
fi

# ── Check current branch ──────────────────────────────────────────────────────────
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
[[ -z "$CURRENT_BRANCH" ]] && exit 0  # detached HEAD etc. — pass

# ── Determine protected branch list ─────────────────────────────────────────────────────
# 1. Load protected_branches from safety-manifest.yaml if it exists
# 2. Use defaults if not found

PROTECTED_BRANCHES=""
MANIFEST=".ai-governance/safety-manifest.yaml"

if [[ -f "$MANIFEST" ]]; then
  PROTECTED_BRANCHES=$(python3 - <<'PYEOF' 2>/dev/null
import sys
try:
    import yaml
    with open(".ai-governance/safety-manifest.yaml", "r") as f:
        manifest = yaml.safe_load(f)
    branches = manifest.get("protected_branches", [])
    print(" ".join(branches))
except Exception:
    sys.exit(1)
PYEOF
) || PROTECTED_BRANCHES=""
fi

# Use defaults if manifest load fails or is empty
if [[ -z "$PROTECTED_BRANCHES" ]]; then
  PROTECTED_BRANCHES="main master develop"
fi

# ── Protected branch matching ──────────────────────────────────────────────────────────
MATCHED_BRANCH=""
for branch in $PROTECTED_BRANCHES; do
  if [[ "$CURRENT_BRANCH" == "$branch" ]]; then
    MATCHED_BRANCH="$branch"
    break
  fi
done

[[ -z "$MATCHED_BRANCH" ]] && exit 0

# ── Block ──────────────────────────────────────────────────────────────────────
TODAY=$(date +%y%m%d 2>/dev/null || echo "today")

cat <<EOF

❌ [guard-branch] Direct commit to protected branch — blocked

Current branch: $CURRENT_BRANCH
Command: $COMMAND

Per 01-git rules, agent direct commits to protected branches (${PROTECTED_BRANCHES}) are forbidden.

Choose one of the following:
  1. Create a feature branch and work there:
     git checkout -b feature/${TODAY}-{description}

  2. If direct commit is needed, the user must execute it manually.
EOF
exit 2
