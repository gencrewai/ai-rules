# 04-workflow — Workflow

## Agent Operating Modes

The mode is recorded in `.claude/agent-mode`. If the file is absent, the default is `auto-push`.

| Mode | Commit | Push | PR | Deploy | AskUserQuestion |
|------|--------|------|----|--------|----------------|
| `manual` | auto | blocked | blocked | blocked | enabled |
| `auto` | auto | auto | auto | blocked | enabled |
| `auto-push` | auto | auto | auto | →develop | minimized (default) |
| `staging` | auto | auto | →develop | staging | minimized |
| `production` | auto | auto | →main | production | minimized |
| `idle` | auto | auto | →develop | staging | forbidden |

- If the project has no develop branch, create one automatically.
- main and master branches are treated identically.

`staging`/`production` modes apply only to projects with server/deployment environments. Do not use for projects without servers (rule repos, docs, etc.).

`idle` mode: Never use AskUserQuestion. Unclear requirements → make the safest autonomous judgment. After 3 failed attempts, record to SESSION.md and terminate.

Mode changes:
```
"Switch to manual mode"     → manual
"Switch to semi-auto mode"  → auto
"Switch to auto mode"       → auto-push
"Switch to staging mode"    → staging
"Switch to production mode" → production
"Switch to idle mode"       → idle
```

Define additional modes per project via extensions.

## Deliverable Gates

| Gate | Transition | Required Deliverables | Skip Allowed |
|------|------------|----------------------|-------------|
| G1 | Plan → Design | INTENT.md + user approval | Yes, if urgent |
| G2 | Design → Implement | DESIGN.md (for DB/API changes) + **INTENT scope re-check** | Yes, if urgent |
| G3 | Implement → Review | Type check + lint pass, commit completed | **Never** |
| G4 | Review → Deploy | APPROVE + security PASS | - |

DESIGN.md location: `docs/design/{feature-name}/DESIGN.md`

### Drift Detection (Required at G2 Transition)

Before moving from design to implementation, re-confirm that the work stays within the INTENT.md scope:

```
✅ Verification items:
  - Are all planned files/features within the scope defined in INTENT.md?
  - Are newly added elements derived from the original intent?

❌ If scope creep is detected:
  → Stop immediately + report to user
  → "Work outside INTENT.md scope has been detected: {details}
     Should we expand the scope, or exclude and proceed?"
```

## Plan Mode Rules

### Auto-Execution Allowed (No Plan Mode Needed)

1. **Read-only tasks**: Reading files, searching, checking status
2. **Urgent requests**: User uses urgency language ("right now", "immediately", etc.)
   - However, even if urgent, **DB schema changes / auth-payment logic / protected branch work** must not skip Plan Mode
3. **Autonomous agent exploration**: Background analysis (Task tool)

### Plan Mode Required

When the user directly requests a bug fix or feature implementation:

```
❌ Never execute immediately:
  "Fix this error" / "Add this feature" / "Fix the bug" / "Change the API"

✅ Use EnterPlanMode first:
  1. Analyze user request
  2. Assess current state
  3. List files to modify + step-by-step plan
  4. ExitPlanMode to await user approval
```

## Minimal Footprint Principle

The agent operates with a **minimal footprint** (per Anthropic official guidance):

- Never modify files outside the request scope
- Use only the minimum required permissions and tools
- Never leave temporary state behind after completion (temp branches, unsquashed WIP commits, etc.). The agent does not create stashes; if a user-created stash exists at session end, report it rather than touching it.
- Prefer simple approaches over complex multi-agent architectures when possible

## AI Autonomous Execution vs. Human Approval Criteria

For background on approval intensity and risk classification, see `docs/guide/AI_RISK_TIERS.md`; for AI collaboration unit design, see `docs/guide/AI_VIBE_CODING_GUIDE.md`.

**Governing principle**: AI may execute autonomously only when all three conditions are met:
- **Small blast radius**: Change is narrow and isolated
- **Clear intent**: What and why can be explained in one sentence
- **Verifiable**: Can be immediately verified with tsc/lint/tests

### AI Autonomous Execution (No Approval Needed)

- Running tsc --noEmit, lint, tests
- Research, analysis, and report writing (no code changes)
- Simple bug fixes — when all three governing principles are met (e.g., 1 file, ≤10 lines)
- Documentation updates, adding comments
- Exploration tasks → delegate to Task tool (Subagent) to protect main context

### Approval Required

- Creating 3+ new files
- Adding/removing dependencies (package.json, requirements.txt, etc.)
- Changing API signatures (function names, parameters, return types)
- Changing error handling patterns
- Diffs that cannot be explained in one sentence

### Human Must Execute Directly (Agent Execution Forbidden)

- Destructive DB changes (see 07-db.md)
- Pushing to protected branches (see 01-git.md)
- Modifying .env files

### Context Exhaustion Prevention

Conversation exceeding ~30 turns or response slowdown detected → snapshot to SESSION.md and request a new session.
Delegate exploration tasks that read many files to the Task tool (Subagent) — receive only the results in the main context.

## AGENTS.md Standard Compatibility

A universal standard jointly adopted by Anthropic/OpenAI/Google/GitHub since 2025:

- If `AGENTS.md` exists at the project root, treat it identically to `CLAUDE.md`
- Read order: `AGENTS.md` → `CLAUDE.md` → `.cursorrules` (when all exist)
- Purpose: ensure rule compatibility across AI tools (Cursor, Copilot, Devin, etc.)

## INTENT.md → SESSION.md Pattern

**Before starting work**:
- Check if INTENT.md exists → if not, check the backlog (FIXME.md) or ask the user
- If `WORKLOG/` exists, check the latest entry → understand recent decisions, completions, and blockers
- Ambiguous situations → record in SESSION.md and ask the user

**Context limit**: Conversation exceeding ~30 turns or response slowdown → snapshot to SESSION.md and request a new session

## WORKLOG Daily Snapshots

If the project has a `WORKLOG/` directory, append in the following format **after each meaningful milestone**.

- **Path**: `WORKLOG/YYYY/MM/YYYY-MM-DD-keyword.md`
- **Base rule**: Same day → append to existing file; new day → create new file
- **Record timing**: Not at session end, but "immediately after a meaningful step completes"
- **Entry structure**: Time, 1–3 lines of key results, links to related documents (`INTENT.md`, `DESIGN.md`, PR, incident docs, etc.)
- **Forbidden**: Pre-creating empty WORKLOG files before session starts; excessive use of tracking checkboxes

Recommended template:
```markdown
# 2026-04-01
#backend #auth #refactor

## 14:20 — Prisma service cleanup
- Key result summary
- Related: `INTENT.md`, `docs/design/auth/DESIGN.md`
```

## Auto-Pick from Backlog

When INTENT.md is empty or missing (in priority order):

1. `FIXME.md` → 🔴 [HIGH] items (broken functionality / security)
2. `FIXME.md` → 🟠 [MED] items
3. `ROADMAP.md` → next milestone items
4. `FIXME.md` → 🟡 [LOW] items
5. `ROADMAP.md` → backlog

**Forbidden**: ⚪ [DEFER] items, items involving DB schema changes (require human approval)

## Failure Protocol

- **Same error twice**: Switch to DIAGNOSE MODE → **invoke the investigator agent** (builder stops modifying)
  - Investigator performs root cause analysis and delivers a diagnosis report to the builder
  - Builder resumes fixes based only on the diagnosis report
- **Before any fix attempt — snapshot policy** (01-git Pre-work Check takes precedence):
  - **Clean worktree**: no snapshot needed. The last commit already is the snapshot; on failure, instruct the user to run `git checkout -- .` or `git reset --hard HEAD` themselves.
  - **Dirty worktree**: the agent must NOT start the fix. Stop and report to the user per 01-git Pre-work Check. The user decides whether to commit, discard, or stash.
  - **If a snapshot is genuinely required**: prefer a **WIP commit** (`git commit -m "WIP: snapshot {desc}"`) over stash — explicit, reflog-recoverable, no staged/untracked loss.
  - **`git stash push` is NOT an agent action.** The agent may only *suggest* the command for the user to run; never auto-execute. Reasons: staged-state loss on pop, untracked file omission, pop conflicts (which would violate 01-git "no auto conflict resolution"), multi-stash index confusion, destruction of user's intentional dirty state.
  - `git stash drop` / `git stash clear` absolutely forbidden under any circumstance.
- **One fix per iteration** → verify → restore snapshot on failure
- **3 consecutive failures**: STOP → rollback → report to user (attach investigator diagnosis report)

### Failure Learning Document Roles

- `FAILURE_LOG.md`: Status ledger for recurring error patterns (Open/Resolved, count, location, prevention)
- If `docs/guide/AI_AGENT_FAILURE_CASEBOOK.md` exists: record **generalizable lessons** such as tooling pitfalls, documentation mistakes, and session management insights
- When the same issue recurs 2+ times → update `FAILURE_LOG.md` first
- If the lesson is reusable across projects → also reflect in the casebook

## Agent Team Invocation Criteria

> Project-specific invocation criteria are defined in the **project CLAUDE.md**.
> The following are baseline guidelines.

| Condition | Agent to Invoke |
|-----------|----------------|
| New feature / task start | planner (always) |
| After planner approval → implementation | builder |
| Same error 2x / DIAGNOSE MODE | investigator |
| Complex features, pre-deployment | qa |
| Before PR creation | reviewer (always) |
| Auth / payments / permissions changes | security |

Invocation order: `planner → builder → [investigator] → [qa] → reviewer → [security]`

## Decision Log

Not enforced for every task — add a `why` block to the WORKLOG **only when at least one trigger below applies**.
No matching trigger = decision log may be omitted (omission implicitly signals "no triggers were hit").

### Decision Log Required Triggers

| Trigger | Example |
|---------|---------|
| 2+ alternatives existed and one was chosen | "Chose middleware over decorator pattern" |
| A rule conflict was interpreted and resolved | "Urgent request, but applied 07-db priority" |
| An R1/R2 reversibility judgment was made | "Column deletion → R2 ruling, proceeded after user confirmation" |
| The user is likely to ask why | Architecture decisions, library selections |

### WORKLOG Decision Log Format

```markdown
## 14:20 — Auth middleware refactoring
- Key result: Extracted JWT verification into middleware/auth.ts

### Decision Log
- why: Duplicate verification in every controller → consolidated into single middleware
- alternatives: Considered decorator pattern, but not applicable for FastAPI
- rule_applied: 02-code (auth logic in controller forbidden)
- reversibility: R0 (previous code instantly recoverable via git)
```

## TodoWrite Rules

Commit/push/merge/deploy items must always include `→ {target}`:
```
✅ "tsc check"
✅ "commit → feature/260224-pricing"
✅ "push → origin/feature/260224-pricing"
✅ "PR → develop"
```
