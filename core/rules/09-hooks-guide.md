# 09-hooks-guide — Hooks Usage Guide

## Advisory vs. Deterministic

| Type | Implementation | Guarantee Level |
|------|---------------|----------------|
| Advisory | CLAUDE.md text | AI tries to follow (may be ignored under context pressure) |
| Deterministic | Hooks (.claude/settings.json) | Always executed (regardless of AI intent) |
| Deterministic | Git hooks (husky) | Auto-runs on commit: commitlint, lint-staged, etc. |

> "Unlike CLAUDE.md instructions which are advisory, hooks are deterministic
>  and guarantee the action happens." — Anthropic official docs

### Hook Distribution Channels

ai-rules sync distributes hooks through two channels:

| Channel | Targets | Examples |
|---------|---------|---------|
| **governance** | `guard-branch.sh`, `guard-reversibility.sh`, `guard-freeze.sh`, `confirm-capture.sh` | Protected branch, R2 comprehensive block, directory lock |
| **tooling** | `guard-secrets.sh`, `guard-push-force.sh`, `guard-destructive-db.sh`, `.husky/*` | Secret detection, push --force block, destructive DB block, commitlint, lint-staged |

Hooks from both channels are merged via `mergeJson` in `.claude/settings.json` and coexist.

---

## Hook Priority Table

### MUST-HOOK (must be backed by hooks)

Core guardrails that can be bypassed under context pressure if only advisory:

| Rule | Hook File | Channel | Detection Condition | Action |
|------|-----------|---------|-------------------|--------|
| No commits on protected branches | `guard-branch.sh` | governance | `git commit` + branch is main/master/develop | Block + warning |
| No git push --force | `guard-push-force.sh` | **tooling** | `push --force` or `push -f` pattern | Block |
| Block migrate reset / DB DROP | `guard-destructive-db.sh` | **tooling** | `migrate reset`, `db push --force-reset`, `DROP DATABASE/TABLE`, `TRUNCATE` | Block + manual procedure guidance |
| R2 reversibility comprehensive block | `guard-reversibility.sh` | governance | Above patterns + additional R2 commands | Block (safety-manifest based) |
| Block agent-initiated `git stash` | `guard-stash.sh` | **tooling** | `git stash push`, `git stash save`, bare `git stash` | Block + suggest WIP commit (per 04-workflow Failure Protocol) |

> **Channel design rationale**: `guard-push-force.sh` and `guard-destructive-db.sh` are distributed via the **tooling channel** so they apply even to projects with `governance.enabled: false`. `guard-branch.sh` and `guard-reversibility.sh` depend on safety-manifest.yaml and remain in the governance channel.

### SHOULD-HOOK (high-impact optional hooks)

Effective additions depending on project needs:

| Rule | Hook File | Hook Type | Detection Condition | Action |
|------|-----------|-----------|-------------------|--------|
| Directory scope lock | `guard-freeze.sh` | `PreToolUse` (`Edit`, `Write`) | Attempt to modify file outside directories specified in `.claude/freeze-dir.txt` | Block (inactive if file missing) |
| Pre-commit tsc check | — | `PreToolUse` (`Bash`) | `git commit` attempt | Run `tsc --noEmit`, block on failure |
| Lint after .ts/.tsx edit | — | `PostToolUse` (`Edit`) | `.ts`, `.tsx` file modified | Auto-run `eslint {file}` |
| .env modification warning | — | `PreToolUse` (`Edit`) | Attempt to modify `.env` file | Request user confirmation |
| Cross-push block | — | `PreToolUse` (`Bash`) | `push origin {A}:{B}` (A≠B pattern) | Block |

#### guard-freeze Usage

When you want to physically lock the work scope:

```bash
# Set lock — only allow modifications to files in this directory
echo "/d/dev/my-project/src/components/" > .claude/freeze-dir.txt

# Remove lock
rm .claude/freeze-dir.txt
```

If `freeze-dir.txt` doesn't exist, the hook is inactive (exit 0). Distributed via the governance channel.

### TEXT-ONLY (Advisory is sufficient)

Procedural, formatting, and style rules don't need hooks:

- ~~Commit message format (conventional commits)~~ → **enforced by commitlint tooling** (`tooling.commitlint`)
- Response confidence labels ([verified]/[inferred]/[unknown])
- Code comment style
- Work completion report format

---

## Per-Project Hook Configuration Location

```json
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/guard-branch.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/lint-on-save.sh"
          }
        ]
      }
    ]
  }
}
```

Hook scripts location: each project's `.claude/hooks/` directory.
This document only provides criteria for deciding what should be a hook.
For actual implementations, see each project's extension or `.claude/hooks/`.

---

## Hook Authoring Principles

1. **Single responsibility**: Each hook checks exactly one rule
2. **Fail fast**: If the block condition is met, exit 1 immediately — no lengthy analysis
3. **Clear messages**: Include the block reason and alternatives in output
4. **Idempotent**: Same input always produces the same result
5. **Injection defense**: Never `eval` or `$()` external inputs (filenames, branch names, commit messages) directly in hook scripts — always capture in variables and inspect only (2026-02 CVE: hooks in untrusted repositories exploited for RCE)

```bash
# ❌ Dangerous — directly executing external input
eval "$COMMIT_MSG"
$(git log --format="%s" -1)

# ✅ Safe — capture in variable and inspect only
BRANCH=$(git branch --show-current 2>/dev/null)
if [[ "$BRANCH" == "main" ]]; then exit 1; fi
```

```bash
#!/bin/bash
# .claude/hooks/guard-branch.sh example

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
PROTECTED=("main" "master" "develop")

for branch in "${PROTECTED[@]}"; do
  if [ "$CURRENT_BRANCH" = "$branch" ]; then
    echo "❌ Direct commit to protected branch ($branch) forbidden (01-git rule)"
    echo "   Create a feature branch: git checkout -b feature/$(date +%y%m%d)-{desc}"
    exit 1
  fi
done
```

---

## Hook Cookbook — Test Examples

Use these patterns to verify hook scripts work correctly.
Claude Code hooks receive JSON via stdin and return a verdict via exit code.

### Exit Code Convention

| Exit Code | Meaning |
|-----------|---------|
| 0 | Pass (execution allowed) |
| 2 | Block (execution forbidden + error message output) |

### guard-push-force.sh Tests

```bash
# Should be blocked
echo '{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}' \
  | bash .claude/hooks/guard-push-force.sh
# expected: exit 2, "push --force forbidden" message

echo '{"tool_name":"Bash","tool_input":{"command":"git push -f"}}' \
  | bash .claude/hooks/guard-push-force.sh
# expected: exit 2

# Should pass
echo '{"tool_name":"Bash","tool_input":{"command":"git push origin feature/260404-test"}}' \
  | bash .claude/hooks/guard-push-force.sh
# expected: exit 0
```

### guard-destructive-db.sh Tests

```bash
# Should be blocked
echo '{"tool_name":"Bash","tool_input":{"command":"npx prisma migrate reset"}}' \
  | bash .claude/hooks/guard-destructive-db.sh
# expected: exit 2, "migrate reset forbidden" + manual procedure guidance

echo '{"tool_name":"Bash","tool_input":{"command":"psql -c \"DROP TABLE users\""}}' \
  | bash .claude/hooks/guard-destructive-db.sh
# expected: exit 2

echo '{"tool_name":"Bash","tool_input":{"command":"DELETE FROM orders"}}' \
  | bash .claude/hooks/guard-destructive-db.sh
# expected: exit 2 (DELETE without WHERE)

# Should pass
echo '{"tool_name":"Bash","tool_input":{"command":"npx prisma migrate status"}}' \
  | bash .claude/hooks/guard-destructive-db.sh
# expected: exit 0

echo '{"tool_name":"Bash","tool_input":{"command":"npx prisma migrate deploy"}}' \
  | bash .claude/hooks/guard-destructive-db.sh
# expected: exit 0
```

### guard-freeze.sh Tests

```bash
# Set lock
echo "/d/dev/my-project/src/" > .claude/freeze-dir.txt

# Should be blocked (outside scope)
echo '{"tool_name":"Edit","tool_input":{"file_path":"/d/dev/my-project/tests/foo.ts"}}' \
  | bash .claude/hooks/guard-freeze.sh
# expected: exit 2, "outside freeze scope" message

# Should pass (inside scope)
echo '{"tool_name":"Edit","tool_input":{"file_path":"/d/dev/my-project/src/app.ts"}}' \
  | bash .claude/hooks/guard-freeze.sh
# expected: exit 0

# Inactive (freeze-dir.txt missing)
rm .claude/freeze-dir.txt
echo '{"tool_name":"Edit","tool_input":{"file_path":"/anywhere/file.ts"}}' \
  | bash .claude/hooks/guard-freeze.sh
# expected: exit 0
```

### guard-secrets.sh Tests

```bash
# Should be blocked (secret detected)
# When staged files contain API_KEY=sk-xxx:
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"feat: add api\""}}' \
  | bash .claude/hooks/guard-secrets.sh
# expected: exit 2, detected secret pattern + file path output

# Should pass (no secrets)
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"docs: update readme\""}}' \
  | bash .claude/hooks/guard-secrets.sh
# expected: exit 0
```

---

## Advisory → Deterministic Promotion Criteria

If the answer to any of these questions is "yes," back the rule with a hook:

- "Does violating this rule cause irreversible damage?" (data loss, security breach)
- "Has this rule been ignored when context grew long?"
- "Should this never execute even if a human accidentally approves it?"
