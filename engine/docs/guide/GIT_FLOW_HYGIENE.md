# Git Flow Hygiene

> Written: 2026-04-03
> Purpose: Define git hygiene procedures to perform before and after code change work, preventing stale-source work, conflicts, and parallel agent interference.

---

## 1. Goal

`core/01-git.md` covers "what must not be done." This document covers "what must be checked first."

This document does not replace `01-git.md`, `04-workflow.md`, or `06-session.md`.
Its role is to organize **hygiene checks that attach to the front of existing core rules**.

Three problems addressed:

- Starting work on stale local sources
- Discovering conflicts with the base branch too late, just before push/PR
- Parallel agents modifying the same files simultaneously

---

## 2. When to Apply

Checking every session wastes unnecessary tokens and time. Use a single decision gate.

**Decision question: "Is there a possibility this session will produce a commit?"**

| Work Type | Pre-Work (Section 3) | Pre-Ship (Section 5) | Parallel Isolation (Section 6) |
|-----------|----------------------|----------------------|-------------------------------|
| Code change (feat/fix/refactor) | Required | Required | Required when applicable |
| Docs-only change | Lightweight (remote + uncommitted only) | Can skip | Required when applicable |
| Read-only / analysis / reporting | Skip | N/A | Skip |
| Test/lint execution only | Skip | N/A | Skip |

### Avoiding Overlap with 06-session

`06-session.md` Step 5 already checks `git status`. The roles differ:

- **06-session**: Assess local state (current branch, uncommitted changes)
- **Git Flow Hygiene**: Assess state relative to remote (behind count, base branch changes)

Items already checked in 06-session are not re-executed.

---

## 3. Pre-Work Hygiene (Before Starting Work)

Before starting code change work, check the following in order.

### 3-1. Fetch Remote State

Fetch the latest reference information from the remote into the local repository. This synchronizes metadata only — it does not change code.

> Note: In git CLI, `git fetch origin`

### 3-2. Check for Uncommitted Changes

Check whether there are uncommitted changes in the current working directory.

- **clean** -> proceed normally
- **dirty** -> report to user and wait for instructions
  - Agent must never discard or hide changes by arbitrarily using stash, reset, or checkout
- **staged/unstaged mixed** -> additional warning
  - When the same file has both staged and unstaged changes, hooks like lint-staged may lose the staged version during the stash/pop process

> Note: If `git status` was already checked in 06-session Step 5, reuse the result

### 3-3. Check Behind Count Against Base Branch

Check how many commits the current branch is behind the base branch (develop/main).

- Applies the same criteria as the existing `01-git.md` rule (behind 50+ or 3+ days old -> warning)
- The purpose here is "catching it early at work start time"

> Note: In git CLI, `git rev-list --count HEAD..origin/{base-branch}`

### Pre-Work Summary Format

```
[Git Hygiene] Pre-Work
  remote: synced
  uncommitted: none (or N files — user confirmation needed)
  behind {base-branch}: N commits
```

---

## 4. Branch Creation Rules

New feature branches must always branch from the **remote latest point of the base branch**.

- Never branch from a stale locally-cached base branch
- Section 3-1's remote fetch must be completed first

> Note: In git CLI, `git checkout -b feature/{YYMMDD}-{desc} origin/{base-branch}`

**Forbidden:**
- Creating a branch without fetching remote state
- Branching from local develop/master (may diverge from remote)

---

## 5. Pre-Ship Hygiene (Before Push/PR)

Before pushing or creating a PR, check the following.

This section does not replace the pre-commit verifications in `01-git.md` (such as `tsc --noEmit`, backend imports, reviewer gate, etc.).
What is covered here is **early detection of drift and potential conflicts against the remote**.

### 5-1. Re-fetch Remote

The base branch may have advanced during work. Fetch the remote state again.

### 5-2. Check File Overlap with Base Branch

Compare the list of files changed in the current branch against the list of files changed in the base branch since the branch point.

- **No overlapping files** -> proceed normally
- **Overlapping files found** -> report conflict potential to user

> Note: In git CLI:
> - My changes: `git diff --name-only origin/{base-branch}...HEAD`
> - Base branch changes: `git diff --name-only {merge-base}..origin/{base-branch}`

### 5-3. Handling Detected Conflicts

Agent must not resolve conflicts via merge/rebase (`01-git.md` rule).

Present options to the user:
1. User manually rebases/merges
2. Create PR as-is (resolve conflicts in GitHub/GitLab)
3. Rework on a v2 branch

---

## 6. Parallel Agent Isolation

Applies when 2 or more agents perform simultaneous code changes in the same repository. Skip this section in single-agent environments.

### Default: Independent Branch + Worktree Isolation

Unless the user directs otherwise, each agent works on an **independent branch in an independent working directory**. This is the safest default.

1. Each agent works in an isolated working directory (sharing the same directory is forbidden)
2. Two agents must never modify the same file simultaneously
3. After parallel work completes -> **human-led integration or PR-based integration** -> verify -> push
4. CI workflow files (.github/workflows, etc.) are handled by a single agent only

> Note: In git CLI, creating an independent working directory uses `git worktree add`

Per `01-git.md` rules, agents do not perform rebase, regular merge, or automatic conflict resolution.
Therefore, "integration" here means a cleanup step performed by a human or handed off via PR, not automatic agent merge.

### Exception via User Directives

Following the same pattern as `01-git.md`'s protected branch exceptions, **the default is isolation, and allowing exceptions requires explicit user instruction**. Agents are forbidden from autonomously deciding to open exceptions.

**Branch sharing allowed:**

```
"Work on the same branch"
"Share feature/260403-xxx branch"
```

-> Share the same feature branch, but domain separation is required as a consequence.

**Domain assignment:**

```
"A handles backend/*, B handles frontend/*"
"A handles service logic, B handles UI"
```

-> Declares the scope of files each agent may modify. Automatically reflected in the file lock table.

**Order control:**

```
"A commits first, then B follows"
"Start B after A finishes"
```

-> Sequential mode. One agent completes commit+push, then the other agent pulls to sync before starting.

**Without any directive** -> default (independent branch + worktree isolation) applies.

### Autonomous Agent Exceptions Forbidden

Agents are forbidden from autonomously relaxing isolation rules by reasoning "files don't overlap so working on the same branch should be fine."

Reasons:
- An agent cannot fully know another agent's future modification plans
- "Not overlapping now" does not guarantee "won't overlap later"
- Risk of misinterpreting agent-to-agent text instructions as human instructions
- `01-git.md`'s protected branch rules follow the same principle: agents do not autonomously decide "this project is an exception"

If an exception is needed, **a human must authenticate with a re-confirmation phrase**. For details on risk-level-based approval methods, authority delegation models, and agent-to-agent instruction misidentification prevention, see [HUMAN_AUTHORITY_MODEL.md](HUMAN_AUTHORITY_MODEL.md).

### Decision Criteria Table

| Condition | Mode | User Directive |
|-----------|------|----------------|
| Fully independent work (different features) | Independent branch + worktree | Not needed (default) |
| Same feature, no file overlap | Branch sharing + domain separation | "Work on the same branch" + domain assignment |
| Same feature, possible file overlap | Branch sharing + sequential mode | "A first, then B" |
| Same feature, file overlap + parallel required | Independent branch + worktree -> PR integration | Not needed (default is already optimal) |

### File Lock Check

This section is a **candidate operational pattern, not a verified core procedure**.
Currently, the common session rules do not mandate a lock field, so each project must designate `SESSION.md` or a separate lock file as the source of truth.

Before starting work, check `files_touched` or the Active Locks table in SESSION.md for files currently held by other agents.

If overlapping files exist:
- Report to user
- Isolate to an independent working directory or wait

**File Lock Table Format (recommended):**

```markdown
## Active Locks

| Agent | Files | Started | Expires |
|-------|-------|---------|---------|
| claude-1 | backend/services/* | 2026-04-03 10:00 | 2026-04-03 12:00 |
| claude-2 | frontend/pages/* | 2026-04-03 10:30 | 2026-04-03 11:30 |
```

### Domain Separation (Required for Branch Sharing)

Domain separation is required in branch sharing mode and strongly recommended in independent branch mode.

```markdown
## Domain Ownership

| Domain | Primary Agent | Backup |
|--------|--------------|--------|
| backend/* | agent-1 | human |
| frontend/* | agent-2 | human |
| docs/* | any | - |
```

---

## 7. Tool-Neutral Expression Guide

The body of this document uses tool-neutral expressions. Specific commands are separated into "Note" blocks within each section and the mapping table below.

Reason: ai-rules outputs to multiple adapters such as Claude Code, Cursor, Windsurf, and plain. Embedding specific commands in the body creates tool dependency and noise in other adapters.

### Mapping Table

| Tool-Neutral Expression | git CLI Example | Notes |
|------------------------|-----------------|-------|
| Fetch remote state | `git fetch origin` | Metadata only, no merge |
| Check for uncommitted changes | `git status` | Can share with 06-session Step 5 |
| Check behind count against base branch | `git rev-list --count HEAD..origin/{base}` | Existing 01-git pattern |
| Branch from remote latest of base branch | `git checkout -b {branch} origin/{base}` | Execute after fetch |
| Compare changed files with base branch | `git diff --name-only origin/{base}...HEAD` | For pre-ship conflict detection |
| Create independent working directory | `git worktree add ../{dir} {branch}` | Parallel agent isolation |

---

## 8. Core Promotion Candidate Tags

Each section of this document can be promoted to a core rule after validation. Promotion targets:

| Section | Promotion Target | Addition Form |
|---------|-----------------|---------------|
| Section 2 (When to Apply) | `04-workflow.md` | One paragraph on Git Hygiene applicability in Minimal Footprint principle |
| Section 3 (Pre-Work) | `01-git.md` | Add items to "Pre-branch-work checks" |
| Section 4 (Branch Creation) | `01-git.md` | Add branching point rules to "Branch Rules" |
| Section 5 (Pre-Ship) | `01-git.md` | Add step 0 to "Commit & Push Process" |
| Section 6 (Parallel Isolation) | `10-subagent-patterns.md` | "Isolation Rules" section under Teammate pattern |

Promotion path: `candidate` (this document) -> applied in 2+ projects -> `validated` -> core promotion

---

## Sources

This document generalizes patterns validated in the following projects into tool-neutral form:

- my-saas-app `docs/guide/BRANCH_STRATEGY.md` — pre-work sync, file lock system, multi-agent scenarios
- my-studio-app `docs/guide/BRANCH_STRATEGY.md` — locks.json-based auto verification, domain separation
- my-studio-app `.claude/agents/git-guardian.md` — conflict detection -> worktree isolation suggestion
- my-saas-app `docs/guide/AI_AGENT_FAILURE_CASEBOOK.md` — parallel agent worktree requirement, lint-staged stash issues
