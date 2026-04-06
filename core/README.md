# core/ — Rules + Agents (Tier 1)

**If you want to apply AI rules to a single project**, this is all you need.
No tooling required. Just copy the files and you're done.

## Quick Start (3 minutes)

### 1. Apply Rules

Copy files from `rules/` into your project's `CLAUDE.md` (or `.cursorrules`, `AI-RULES.md`).

```bash
# For Claude Code
cat rules/01-git.md rules/02-code.md rules/03-security.md > ../my-project/CLAUDE.md

# Or selectively copy only the rules you need
cp rules/01-git.md ../my-project/docs/rules/
```

### 2. Apply Agents

Copy files from `agents/` into your project's `.claude/agents/`.

```bash
mkdir -p ../my-project/.claude/agents
cp agents/planner.md agents/builder.md agents/reviewer.md ../my-project/.claude/agents/
```

### 3. Done

That's it — your AI agent will now follow the rules.

---

## rules/ — 12 Rule Files

| File | Key Content | Recommended For |
|------|-------------|----------------|
| `00-identity` | Persona, communication, language | All projects |
| `01-git` | Branches, commits, protected branches | All projects |
| `02-code` | Code Hard Bans (React, FastAPI) | Code projects |
| `03-security` | Security, reversibility R0/R1/R2 | All projects |
| `04-workflow` | Agent modes, Plan Mode | All projects |
| `05-responses` | Response format, confidence labels | Optional |
| `06-session` | Session management, HANDOFF | Optional |
| `07-db` | DB safety, migration | When using a DB |
| `08-local-env` | Port/DB collision prevention | Local development |
| `08-ui-first` | UI mockup-first | Frontend projects |
| `09-hooks-guide` | Advisory vs Deterministic | When designing hooks |
| `10-subagent-patterns` | Subagent usage | Multi-agent setups |

**Minimum set**: `01-git` + `02-code` + `03-security` + `04-workflow` (4 rules are enough)

## agents/ — 9 Agent Definitions

Agents are separated by role and follow the **principle of least privilege**.

| Agent | Allowed Tools | When to Use |
|-------|---------------|-------------|
| `planner` | Read, Glob, Grep | Task kickoff |
| `builder` | All | Implementation |
| `reviewer` | Read, Glob, Grep | Before PR |
| `qa` | Read, Glob, Grep, Bash | Testing |
| `security` | Read, Glob, Grep | Security changes |

**Minimum set**: `planner` + `builder` + `reviewer` (3 agents are enough)

## Customizing for Your Project

You can use the rules as-is, or modify them to fit your project.

- **Add rules**: Create project-specific rule files in `extensions/` → [Examples](../examples/extensions/)
- **Extend agents**: Add project-specific agent instructions in `agents-ext/` → [Examples](../examples/agents-ext/)
- **Manage multiple projects**: Use the sync engine → [engine/README.md](../engine/README.md)
