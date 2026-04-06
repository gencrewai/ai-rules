# 10-subagent-patterns — Subagent Usage Patterns

## Why Subagents

Running exploration and analysis tasks in the main session consumes the context window.
At 70%+ context usage, precision degrades; at 85%+, hallucination rates increase (research-based).

Subagents run in independent contexts, keeping the main session clean.

---

## Core Pattern: Explore with Subagents, Implement in Main

Don't perform exploration tasks (file reading, searching, analysis) directly in the main session —
delegate to subagents and receive only summarized results.

**Good candidates for delegation**:
- Full project structure analysis
- Dependency relationship investigation
- Codebase pattern searches (API endpoint lists, component inventories, etc.)
- Security vulnerability scans
- Large-scale reviews (full PR review)

**Keep in main session**:
- Code implementation and modification
- Commits, pushes
- User conversations

---

## Subagent Permission Design (Operational Philosophy)

Each agent has only the minimum permissions required for its role.

| Agent | Allowed Tools | Forbidden Tools | Model |
|-------|--------------|----------------|-------|
| `planner` | Read, Glob, Grep, WebSearch | Edit, Write, Bash | default |
| `builder` | All | — | default |
| `investigator` | Read, Glob, Grep, Bash | Edit, Write | default |
| `reviewer` | Read, Glob, Grep | Edit, Write, Bash | claude-opus-4-6 (precision matters) |
| `qa` | Read, Glob, Grep, Bash | Edit, Write | default |
| `security` | Read, Glob, Grep | Edit, Write, Bash | claude-opus-4-6 |

**Why restrict permissions**:
- If investigator has Edit permissions, it may "fix while diagnosing" — role confusion, Iron Law violation
- If reviewer has Edit permissions, it may "fix while reviewing" — role confusion
- If security has Bash, it may attempt arbitrary patches upon finding vulnerabilities
- If planner has Write permissions, it may start generating code during the planning phase

---

## Subagent Definition Format (.claude/agents/)

File location: `.claude/agents/{agent-name}.md`

```markdown
---
name: reviewer
description: Pre-PR code review agent. Read and analyze only — no modifications.
  Reviews code quality, rule compliance, and security issues, then returns review comments.
model: claude-opus-4-6
tools: Read, Glob, Grep
---

## Role

Specialized agent for pre-PR code review.
Does not make modifications — only reports findings.

## Review Checklist

- [ ] 02-code Hard Bans violations
- [ ] 03-security STRIDE items
- [ ] Backward compatibility on API signature changes
- [ ] Test coverage adequacy
```

---

## base agent → .claude/agents/ Migration Plan

Current `agents/base-*.md` files are not in the official Claude Code subagent format.
Adding YAML frontmatter converts them to executable subagents:

| Current File | After Migration | Permission Changes |
|-------------|----------------|-------------------|
| `agents/base-planner.md` | `name: planner`, `tools: Read,Glob,Grep,WebSearch` | Write/Edit removed |
| `agents/base-builder.md` | `name: builder`, tools: all | No change |
| `agents/base-reviewer.md` | `name: reviewer`, `model: claude-opus-4-6`, `tools: Read,Glob,Grep` | Edit/Bash removed |
| `agents/base-qa.md` | `name: qa`, `tools: Read,Glob,Grep,Bash` | Edit/Write removed |
| `agents/base-security.md` | `name: security`, `model: claude-opus-4-6`, `tools: Read,Glob,Grep` | Edit/Write/Bash removed |

`adapters/claude-code.mjs` will be updated to include frontmatter when outputting per-project `.claude/agents/` (Phase 3).

---

## Teammate Pattern (Parallel Independent Work)

Subagents report only to the main agent, but **Teammates** are independent agents that can message each other directly.

| Aspect | Subagent | Teammate |
|--------|---------|---------|
| Communication | Reports to main agent only | Can message each other directly |
| Context | Independent | Independent |
| Best for | Sequential delegation (explore → results) | Parallel independent tasks |

**When to use Teammates**:
- When frontend and backend implementation can proceed simultaneously
- When the two tasks don't need to wait for each other's results
- Each reports to the main agent upon completion

```
# Teammate pattern example
Main: "Spawn frontend teammate + backend teammate simultaneously"
  └─ frontend-builder teammate: UI component implementation
  └─ backend-builder teammate: API endpoint implementation
  └─ (both complete) Main: integration verification
```

## Context Budget Guidelines

| Situation | Recommended Action |
|-----------|-------------------|
| 5 or fewer files to explore | Read directly in main session |
| 6 or more files to explore | Delegate to subagent |
| Conversation exceeds 30 turns | Snapshot SESSION.md → new session |
| Response latency degradation detected | Immediately write SESSION.md → request new session |
| 3 or more files to review | Delegate to reviewer subagent |
