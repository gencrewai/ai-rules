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
- **`Out-of-scope edits:`** — list any path matching triggers A/B/C from the Out-of-Scope Edit Disclosure section, with a one-line summary per file. If none, write `Out-of-scope edits: none` explicitly. This field is mandatory; omitting it is itself a rule violation.

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

## Out-of-Scope Edit Disclosure (Required)

(Complements 04-workflow Minimal Footprint — that rule says *don't*; this one says *if you must, disclose*.)

### Triggers (objective — not "agent's judgment")

The agent MUST follow the disclosure protocol below if **any** of these apply:

| Trigger | Example |
|---------|---------|
| **A. Different project / working directory** | Current cwd is `/projects/ai-rules` but the edit targets `/projects/other-app/...` or any other repo |
| **B. Shared infrastructure inside the current repo** | `core/`, `tools/`, `adapters/`, root config files (`package.json`, `tsconfig*.json`, `.github/`, etc.) |
| **C. Unmentioned files** | Files the user did not name in the request, when the request sounded local/specific |

### Protocol

1. **Before editing — list paths.** Output the exact paths (absolute when crossing projects) and a one-line reason per path. Then:
   - **Trigger A (different project)** → STOP and ask for explicit confirmation. Never edit another project's files without a "yes" in the same turn.
   - **Trigger B (shared infra)** → STOP and ask for explicit confirmation. A single `core/` edit propagates to every downstream project on next sync.
   - **Trigger C (unmentioned files only)** → list and proceed unless the user objects.
2. **After editing — list paths again.** In the Completion Report, include an `Out-of-scope edits:` field listing every changed path with a one-line summary per file. If none, write `Out-of-scope edits: none` explicitly (so absence is auditable, not silent).

### Rationale

- **Cross-project edits** are the most surprising — the user often does not realize the agent even *can* reach another repo. Real incident: agent fixed `core/` rules while user thought the change was local to a feature branch.
- **`core/` ripple effect**: one small edit propagates to every downstream project after sync. Explicit pre-confirmation is cheap; post-incident rollback is not.
- **Auditable absence**: forcing `Out-of-scope edits: none` makes silence a positive declaration rather than an oversight.

## Repository Scan Prohibition

Full repository scanning is forbidden — only read files referenced from CLAUDE.md, the project's docs index, or (if the project uses one) INTENT.md.

**Exception — Missing Navigation Anchors (New/Early-Stage Projects)**

A limited one-time scan is allowed at session start **only when ALL** of the following apply (matches 06-session Step 0 — Discovery Anchor Check):

- `docs/00_INDEX.md` does not exist, AND
- `INTENT.md` does not exist, AND
- `docs/` directory does not exist

If any single anchor exists, the project is treated as mature and the scan exception does NOT apply. This avoids false positives where an established project simply hasn't created an index file yet.

Allowed scan scope:
1. `*.html` files at project root (excluding node_modules, dist, build, index.html)
2. One level of directory structure under `docs/`, `ui-mockups/`, `mockups/`, `wireframes/`, `design/`

After scanning, report discovered assets to the user. If the project uses INTENT.md, register the paths in its `context.docs`. Standard rules apply from that point forward.
