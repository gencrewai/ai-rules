# WORKLOG

This directory stores project work logs, functioning like a `TIL` (Today I Learned) journal.

## Path Convention

- `WORKLOG/YYYY/MM/YYYY-MM-DD-keyword.md`
- Same day: append to the existing file
- New day: create a new file

## Logging Principles

- Don't batch-write at session end — **log right after completing a meaningful step**
- Include the time, key results, and links to related documents
- Prefer snapshot-style descriptions over checkbox tracking

## Example

```md
# 2026-04-01
#backend #auth #refactor

## 14:20 — Prisma service cleanup
- Fixed connection creation responsibility to the service layer
- Related: `INTENT.md`, `docs/design/auth/DESIGN.md`
```

## Related Documents

- `INTENT.md` — Goals/scope of the current task
- `SESSION.md` — Handoff / blocked / next
- `FAILURE_LOG.md` — Recurring failure patterns
- `docs/guide/AI_AGENT_FAILURE_CASEBOOK.md` — Generalizable operational lessons
