#!/bin/bash
# guard-g3-gate.sh — G3 gate: minimum validation before commit
#
# PreToolUse hook (Bash matcher)
# Runs project validation when a git commit is attempted.
#
# For this repo (ai-rules): node scripts/validate.mjs
# For target projects: detect toolchain and run tsc/eslint/ruff etc.
#
# Usage: Register in hooks.PreToolUse of .claude/settings.json
# {
#   "matcher": "Bash",
#   "hooks": [{ "type": "command", "command": ".claude/hooks/guard-g3-gate.sh" }]
# }

# Read tool input from stdin
INPUT=$(cat)

# Pass if not a git commit pattern
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Pass if not git commit
if ! echo "$COMMAND" | grep -qE '^\s*git\s+commit'; then
  exit 0
fi

# ── Run project validation ──────────────────────────────────────────────

# ai-rules repo itself: scripts/validate.mjs
if [ -f "scripts/validate.mjs" ]; then
  OUTPUT=$(node scripts/validate.mjs 2>&1)
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo "❌ G3 Gate FAIL: validate.mjs validation failed"
    echo "$OUTPUT" | tail -5
    echo ""
    echo "Fix validation errors before committing."
    exit 2
  fi
  exit 0
fi

# TypeScript project
if [ -f "tsconfig.json" ]; then
  # Check if staged files include .ts/.tsx
  STAGED_TS=$(git diff --cached --name-only 2>/dev/null | grep -E '\.(ts|tsx)$')
  if [ -n "$STAGED_TS" ]; then
    OUTPUT=$(npx tsc --noEmit 2>&1)
    EXIT_CODE=$?
    if [ $EXIT_CODE -ne 0 ]; then
      echo "❌ G3 Gate FAIL: tsc --noEmit errors"
      echo "$OUTPUT" | tail -10
      echo ""
      echo "Fix type errors before committing."
      exit 2
    fi
  fi
fi

# Python project (ruff)
if [ -f "pyproject.toml" ] && grep -q "ruff" pyproject.toml 2>/dev/null; then
  STAGED_PY=$(git diff --cached --name-only 2>/dev/null | grep -E '\.py$')
  if [ -n "$STAGED_PY" ]; then
    OUTPUT=$(ruff check . 2>&1)
    EXIT_CODE=$?
    if [ $EXIT_CODE -ne 0 ]; then
      echo "❌ G3 Gate FAIL: ruff check errors"
      echo "$OUTPUT" | tail -10
      echo ""
      echo "Fix lint errors before committing."
      exit 2
    fi
  fi
fi

# ESLint
for CONFIG in .eslintrc .eslintrc.js .eslintrc.json .eslintrc.yml eslint.config.js eslint.config.mjs; do
  if [ -f "$CONFIG" ]; then
    STAGED_JS=$(git diff --cached --name-only 2>/dev/null | grep -E '\.(js|jsx|ts|tsx)$')
    if [ -n "$STAGED_JS" ]; then
      OUTPUT=$(npx eslint . 2>&1)
      EXIT_CODE=$?
      if [ $EXIT_CODE -ne 0 ]; then
        echo "❌ G3 Gate FAIL: eslint errors"
        echo "$OUTPUT" | tail -10
        echo ""
        echo "Fix lint errors before committing."
        exit 2
      fi
    fi
    break
  fi
done

# All validations passed (or no matching toolchain)
exit 0
