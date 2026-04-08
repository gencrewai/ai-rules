#!/usr/bin/env bash
# guard-secrets.sh — PreToolUse(Bash) hook
# Detects and blocks secret patterns in staged files during git commit/add
#
# Detection patterns:
#   - Environment variable assignments like API_KEY=, SECRET_KEY=, PASSWORD=
#   - Bearer tokens, AWS keys, GitHub tokens, etc.
#   - 32+ character continuous hex/base64 strings (in variable assignment context)
#
# Exclusions:
#   - .env.example (contains only keys without values)
#   - *.test.*, *.spec.* (test files)
#   - package-lock.json, yarn.lock (dependency locks)

set -uo pipefail

# PreToolUse hook: read JSON input from stdin
INPUT=$(cat 2>/dev/null || true)
[[ -z "$INPUT" ]] && exit 0

# Process Bash tool only
TOOL_NAME=$(printf '%s' "$INPUT" | grep -o '"tool_name":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

# Check if command is git commit or git add
COMMAND=$(printf '%s' "$INPUT" | grep -o '"command":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
if ! printf '%s' "$COMMAND" | grep -qE 'git (commit|add)'; then
  exit 0
fi

# Get staged file list
STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

VIOLATIONS=""

while IFS= read -r file; do
  # Skip exclusions
  case "$file" in
    *.env.example|*.test.*|*.spec.*|package-lock.json|yarn.lock|pnpm-lock.yaml)
      continue
      ;;
  esac

  # Check if file exists (skip deleted files)
  if [ ! -f "$file" ]; then
    continue
  fi

  # Search for secret patterns in staged content (added lines only)
  DIFF_CONTENT=$(git diff --cached -- "$file" 2>/dev/null | grep '^+' | grep -v '^+++' || true)

  if [ -z "$DIFF_CONTENT" ]; then
    continue
  fi

  # Pattern 1: Environment variable assignment (with values only)
  MATCH=$(printf '%s' "$DIFF_CONTENT" | grep -iE '(API_KEY|SECRET_KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY|ACCESS_KEY)\s*[=:]\s*["\x27]?[A-Za-z0-9/+=]{8,}' || true)

  # Pattern 2: AWS Access Key (20 chars starting with AKIA)
  MATCH2=$(printf '%s' "$DIFF_CONTENT" | grep -oE 'AKIA[0-9A-Z]{16}' || true)

  # Pattern 3: GitHub token (ghp_, gho_, ghu_, ghs_, ghr_)
  MATCH3=$(printf '%s' "$DIFF_CONTENT" | grep -oE 'gh[pousr]_[A-Za-z0-9_]{36,}' || true)

  # Pattern 4: Hardcoded Bearer token
  MATCH4=$(printf '%s' "$DIFF_CONTENT" | grep -iE 'Bearer\s+[A-Za-z0-9._\-]{20,}' || true)

  if [ -n "$MATCH" ] || [ -n "$MATCH2" ] || [ -n "$MATCH3" ] || [ -n "$MATCH4" ]; then
    VIOLATIONS="${VIOLATIONS}\n  - ${file}"
  fi
done <<< "$STAGED_FILES"

if [ -n "$VIOLATIONS" ]; then
  echo "RESULT: block"
  echo "REASON: Secret patterns detected (03-security rules)"
  printf "  Files:%b\n" "$VIOLATIONS"
  echo ""
  echo "  Actions:"
  echo "    1. Move the values to environment variables (.env)"
  echo "    2. Verify .env is included in .gitignore"
  echo "    3. If test dummy values, list only key names in .env.example"
  exit 2
fi

exit 0
