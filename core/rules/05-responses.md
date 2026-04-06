# 05-responses — Response Format Rules

## Confidence Labels

All code modification and analysis responses must include a label:

| Label | Meaning |
|-------|---------|
| `[verified]` | Directly confirmed via code execution or output |
| `[inferred]` | Analyzed by reading files, but not verified by execution |
| `[unknown]` | No means of verification, or uncertain |

## Completion Report (Required for Code Changes)

### 1. Change Summary
- List of changed files (path + one-line description of change)
- Current branch / PR status
- Commit hash

### 2. Branch Status Report

```
| Branch | Status | PR | Action Needed |
|--------|--------|----|---------------|
| feature/xxx | ✅ Merged | #123 | Can be deleted |
| feature/yyy | 🔄 PR open | #124 | Awaiting review |
| feature/zzz | ⚠️ Unmerged (5 days) | None | Decision needed |
```

### 3. Follow-Up Checklist

- [ ] DB migration (if schema changed)
- [ ] Environment variable changes (if new variables added)
- [ ] E2E test run (if UI/API changed)
- [ ] Staging deployment (after pushing to develop)
- [ ] Production deployment (only on user request)

## Repository Scan Prohibition

Full repository scanning is forbidden — only read files referenced from CLAUDE.md / INTENT.md / docs index.

**Exception — Missing Navigation Anchors (New/Early-Stage Projects)**

A limited one-time scan is allowed at session start if any of the following apply:

- `docs/00_INDEX.md` does not exist
- `INTENT.md` does not exist
- `docs/` directory does not exist

Allowed scan scope:
1. `*.html` files at project root (excluding node_modules, dist, build, index.html)
2. One level of directory structure under `docs/`, `ui-mockups/`, `mockups/`, `wireframes/`, `design/`

After scanning, report discovered assets to the user and register them in `context.docs` if INTENT.md exists.
Standard rules apply from that point forward.
