# 01-git — Git Rules

## Forbidden Agent Commands (CRITICAL)

❌ **Never allowed**: `rebase`, `merge` (except ff-only), `checkout --ours/--theirs`, automatic conflict resolution, `push -f/--force`

✅ **Allowed**: `status`/`log`/`diff`/`fetch`, create new branch (`checkout -b`), `add`/`commit`/`push origin {branch}`
- Push must always go from **current branch → same-name remote** (`push origin feature/xxx`) — cross-push like `push origin feature/xxx:master` is strictly forbidden

**On conflict**: Immediately `--abort` and report to user — never auto-resolve

**On ff-only merge failure**: Never attempt rebase/merge --no-ff automatically — stop immediately and report to user:
```
"ff-only merge is not possible (branches have diverged).
 Per 01-git rules, rebase is forbidden.
 1. Switch to PR approach (→ origin/master)
 2. User handles manually"
```

## Pre-work Environment Check

Before starting any code change (feat/fix/refactor), verify the following in order.
May be skipped for read-only/analysis/test-only tasks. For docs-only changes, check steps 1-2 only.

1. **Sync remote refs**: Fetch latest remote reference data (metadata only, no code changes)
2. **Check uncommitted changes**: Verify the working directory for uncommitted changes
   - clean → proceed normally
   - dirty → report to user and wait for instructions (agent must never stash/reset/checkout on its own)
   - mixed staged/unstaged → additional warning (hooks may lose staged versions during stash/pop)
3. **Check behind count vs. base branch**: Apply the same criteria as "Pre-branch Work Check" below

If `git status` was already checked in 06-session Step 5, skip step 2.

## Branch Rules

- **Branch naming**: `feature/{YYMMDD}-{description}` (e.g., `feature/260120-auth-refactor`)
- **Agent must always work on feature branches** — direct commits to develop/main are forbidden
- **New branches must fork from the latest remote base branch** — never fork from a stale local base branch
- feature → develop PR → merge after user approval
- **Stale branch threshold**: 3+ days old or 50+ commits behind develop → warn + suggest v2 branch

## Pre-branch Work Check

Before starting work on any feature branch:
```bash
git rev-list --count HEAD..origin/develop  # Check behind count
git log --oneline -1                       # Check branch age
```

If 3+ days old or 50+ behind: warn user → present these options:
```
"1. User rebases manually then resumes (agent must not run rebase)
 2. Create a new v2 branch (→ feature/{YYMMDD}-{desc}-v2)
 3. Accept the risk and continue on the current branch"
```

## Commit Rules

- **Format**: `{type}({scope}): {description}` (conventional commits) — **commitlint validates via commit-msg hook** (`tooling.commitlint`)
  - type: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`
- **Co-Authored-By required**:
  ```
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```

## Commit & Push Process

Default behavior: **follows agent mode** (see 04-workflow, default is `auto`)

0. **Protected branch check** (CRITICAL — required before every commit) — **guard-branch.sh hook provides redundant enforcement** (`governance`):
   - Check current branch with `git branch --show-current`
   - If on main/master/develop → **commit is forbidden** → notify user
   - May only proceed if user explicitly chooses an exception
1. Source validation — **lint-staged runs automatically via pre-commit hook** (`tooling.lint_staged`)
   - Validation failure auto-aborts the commit
   - Bypassing validation (`// @ts-ignore`, `eslint-disable`) is forbidden
2. Diff report: list changed files + line counts, warn if 1000+ lines
3. Mode-specific behavior:
   - `manual`: commit only (push and PR blocked)
   - `auto`: commit + push after user approval — "Commit + push (→ origin/{branch})" / "Commit only (local)" / "Cancel"
   - `auto-push`: auto commit + push (feature branches only)
   - Other modes: follow project extension definitions

## Pre-push/PR Conflict Check

Immediately before push or PR creation, verify the following. This step is separate from source validation (tsc, lint, etc.).

1. **Re-sync remote refs**: The base branch may have advanced during work, so fetch remote state again
2. **Check file overlap with base branch**: Compare changed files in current branch against changes in base branch
   - No overlapping files → proceed normally
   - Overlapping files → report potential conflict to user
3. **On conflict detection**: Agent must not attempt resolution via merge/rebase (per existing rules). Present options to user:
   - User handles rebase/merge manually
   - Create PR as-is (resolve conflicts in GitHub/GitLab)
   - Rework on a v2 branch

## Deployment Restrictions

❌ **Auto-forbidden**: Production deployment, merging to main branch, production environment changes

✅ **Only on explicit user request**: "Deploy to production" / "Merge to main" / "Deploy to staging"

## CI Rules

- **Never weaken tests**: Do not modify or bypass tests to make them pass
- **Never bypass checks**: Do not use `eslint-disable`, `@ts-ignore`, etc. to bypass CI checks
- **Open PR conflicts**: If files conflict with another open PR → comment only, no commits
- **Agent PR additional validation**: Agent-generated PRs require reviewer subagent approval (GitHub Copilot Agent / Devin standard pattern)
  - PR creation is blocked until reviewer subagent passes
  - PR body must include `🤖 Generated by agent` label
