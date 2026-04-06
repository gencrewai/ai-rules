# WORKLOG and Failure Learning

## Purpose

Ensure project progress context is not lost with `INTENT.md`/`SESSION.md` alone, by maintaining separate chronological work snapshots and failure learning documents.

## Document Role Separation

| Document | Role | Example Question |
|----------|------|------------------|
| `INTENT.md` | Goals/scope/verification criteria for current work | "What did we agree to do this time?" |
| `SESSION.md` | Session handoff, blockers, next actions | "Where should the next session pick up?" |
| `WORKLOG/YYYY/MM/YYYY-MM-DD-keyword.md` | Chronological work snapshots | "What changed today and what decisions were made?" |
| `FAILURE_LOG.md` | Recurring failure pattern ledger | "Is the same problem happening again?" |
| `docs/guide/AI_AGENT_FAILURE_CASEBOOK.md` | Generalizable failure lessons / operational playbook | "How should we behave next time?" |

## WORKLOG Rules

- Path: `WORKLOG/YYYY/MM/YYYY-MM-DD-keyword.md`
- Append to existing file for the same day
- Create new file when the date changes
- Never pre-create empty files before a session starts
- Do not batch-write at session end; **record immediately after completing a meaningful step**

## Recommended Format

```md
# 2026-04-01
#backend #auth #refactor

## 14:20 — Prisma service cleanup
- Fixed connection creation responsibility to the service layer
- Related: `INTENT.md`, `docs/design/auth/DESIGN.md`

## 15:05 — Type error fix
- Fixed missing nullable handling
- Related: `FAILURE_LOG.md`
```

## What Must Be Recorded in WORKLOG

- **Why** a decision was made, more than what changed
- State information that enables the next step to flow naturally
- Related document links (`INTENT.md`, `DESIGN.md`, PR, tests, incident docs)
- If something failed, include the **workaround/lesson** beyond just the symptom

## FAILURE_LOG vs CASEBOOK

### `FAILURE_LOG.md`

Record here when:

- The same error has recurred 2+ times
- There are signs of recurrence in the same file/domain/error type
- Preventive measures need to be tracked as a checklist

Example entry:

```md
## FL-012: auth null-check omission
- Status: Open
- Occurrence date: 2026-04-01
- Affected file: src/auth/useSession.ts
- Symptom: Screen breaks from null access right after login
- Root cause: Missing optional response contract
- Prevention: Include null-guard in the default checklist
```

### `docs/guide/AI_AGENT_FAILURE_CASEBOOK.md`

Record here when:

- Lessons are reusable across multiple projects
- Operational issues like tooling traps, encoding/BOM, path/shell differences
- Work habit corrections like document append locations, session start check order

Examples:

- "Works in PowerShell but fails in Git Bash SSH due to BOM"
- "Must check bottom reference block position before WORKLOG append"
- "Trust latest WORKLOG/SESSION over earlier conversation history"

## Session Operation Summary

Session start:

1. Check `SESSION.md`
2. Check latest `WORKLOG` (1 entry)
3. Check `INTENT.md`
4. If needed, check `FAILURE_LOG.md` and casebook

Session end:

1. Update `SESSION.md` handoff
2. Append to `WORKLOG` if meaningful progress was made
3. Update `FAILURE_LOG.md` if recurring failures occurred
4. Reflect in casebook if lessons are generalizable
