# Applied Project Example

> This directory shows what a real project looks like **after ai-rules are applied**.

## Structure

```
my-project/
├── .claude/
│   ├── settings.json          # Hook configuration (deterministic enforcement)
│   ├── hooks/
│   │   └── guard-secrets.sh   # Secret detection hook
│   └── agents/
│       ├── planner.md         # Task planning agent
│       ├── builder.md         # Code implementation agent
│       └── reviewer.md        # Code review agent
│
├── .cursor/
│   └── rules/
│       └── ai-rules.mdc      # Cursor AI rules
│
├── CLAUDE.md                  # Claude Code rules (sync output)
├── AI-RULES.md                # Plain text rules (tool-agnostic fallback)
└── .windsurfrules             # Windsurf rules
```

## How These Files Are Generated

### Option A: Manual Copy (core/ only)

```bash
# 1. Copy rules
cat core/rules/01-git.md core/rules/02-code.md > my-project/CLAUDE.md

# 2. Copy agents
cp core/agents/planner.md core/agents/builder.md core/agents/reviewer.md \
   my-project/.claude/agents/
```

### Option B: Sync Engine (engine/)

```bash
cd engine
npm run sync                # Generate output from profile
npm run sync:apply          # Apply to target project
```

## Advisory vs Deterministic

| Layer | File | Guarantee |
|-------|------|-----------|
| Advisory | `CLAUDE.md`, `.windsurfrules` | AI tries to follow (may ignore under context pressure) |
| Deterministic | `.claude/settings.json` + hooks | Always executes (regardless of AI intent) |

The hook in `.claude/hooks/guard-secrets.sh` is a **deterministic** guard.
Even if the AI ignores the advisory rule "no hardcoded secrets", the hook
will detect and block the commit.

## Customization

- Edit `CLAUDE.md` content by modifying `core/rules/` source files
- Add project-specific rules in `extensions/`
- Add agent extensions in `agents-ext/`
- See [examples/extensions/](../extensions/) and [examples/agents-ext/](../agents-ext/)
