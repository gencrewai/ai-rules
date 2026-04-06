# Agent Management Guide

Centrally manage `.claude/agents/` agent files and deploy them per-project using the ai-rules sync system.

## Concepts

```
agents/                <- base agents (universal skeleton, shared across all projects)
agents-ext/{project}/  <- per-project extension directories (appended to base body)
profiles/*.yaml        <- profiles specify how agents are assembled
output/{project}/.claude/agents/  <- sync output
```

### base + extension append pattern

Reuses the `core/ + extensions/` pattern from CLAUDE.md.

- **base** (`agents/`): YAML frontmatter + universal markdown body
- **extension** (`agents-ext/{project}/`): pure markdown (no frontmatter), appended to end of base body
- **frontmatter is defined only in base** — extensions cannot modify `tools` (security)

## Current Agent Roster

### Universal Agents (used as-is from base)

| Agent | Role | Tools |
|-------|------|-------|
| `planner` | Task planning, INTENT.md authoring, backlog management | Read, Glob, Grep, Bash |
| `architect` | INTENT to DESIGN.md, API/DB matrix | Read, Glob, Grep, Bash |
| `orchestrator` | Pipeline gate management, agent dispatch | Read, Glob, Grep, Bash |
| `security` | STRIDE-based security audit | Read, Glob, Grep, Bash |
| `qa` | Test authoring/execution, FAILURE_LOG management | Read, Edit, Write, Glob, Grep, Bash |

### Customizable Agents (base + extension)

| Agent | Role | Extension Example |
|-------|------|-------------------|
| `builder` | Code implementation, feature development, bug fixes | `agents-ext/my-saas-app/builder.md` (design token rules) |
| `reviewer` | Code review, PR checklist | `agents-ext/my-saas-app/reviewer.md` (design token checklist) |
| `designer` | UI/UX design, design token management | `agents-ext/my-saas-app/designer.md` (token system, font rules) |

## File Format

### Base Agents (`agents/*.md`)

YAML frontmatter + markdown body:

```markdown
---
name: builder
description: >
  Specializes in code implementation, feature development, and bug fixes.
  Implements based on INTENT.md/DESIGN.md.
tools: [Read, Edit, Write, Glob, Grep, Bash]
---

# Builder Agent — Code Implementation Specialist

## Role
Agent responsible for code implementation, feature development, and bug fixes.
...
```

**Required frontmatter fields:**
- `name` — agent identifier
- `description` — role description
- `tools` — list of available tools (referenced by Claude Code)

### Extensions (`agents-ext/{project}/*.md`)

Pure markdown, no frontmatter:

```markdown
### MyApp Design Token Compliance Rules

When writing UI code, always reference `docs/design/DESIGN_TOKENS.md`:
- **Colors**: use CSS variables only, hardcoded values forbidden
- **Spacing**: use Tailwind standard scale only
...
```

## Profile Configuration

`agents` section in `profiles/*.yaml`:

```yaml
agents:
  enabled: true          # if false, no agent files are generated
  include:
    - planner            # string -> copy base as-is
    - builder:           # object -> synthesize base + extensions
        extensions: [builder]  # -> agents-ext/{project}/builder.md
  overrides:             # inline additions (3 lines or fewer, optional)
    planner: |
      Additional content...
```

### include formats

| Format | Example | Result |
|--------|---------|--------|
| string | `- planner` | `agents/planner.md` as-is |
| object | `- builder: {extensions: [builder]}` | base body + `agents-ext/{project}/builder.md` appended |

### overrides

Short additions of 3 lines or fewer can be written inline in the profile YAML. For longer content, create a file in `agents-ext/{project}/`.

## Per-Project Configuration Examples

### my-saas-app (full 8 agents + 3 extensions)

```yaml
agents:
  enabled: true
  include:
    - planner
    - architect
    - orchestrator
    - security
    - qa
    - builder:
        extensions: [builder]    # -> agents-ext/my-saas-app/builder.md
    - reviewer:
        extensions: [reviewer]   # -> agents-ext/my-saas-app/reviewer.md
    - designer:
        extensions: [designer]   # -> agents-ext/my-saas-app/designer.md
```

-> MyApp design token rules are added to builder/reviewer/designer

### prompt-store (3 base agents)

```yaml
agents:
  enabled: true
  include:
    - planner
    - builder
    - reviewer
```

-> Uses only base agents (no extensions)

### global (agents disabled)

```yaml
agents:
  enabled: false
```

-> No agents needed for global rules

## Adding New Agents

### 1. Add a Universal Agent

Create an `.md` file in `agents/`:

```markdown
---
name: my-agent
description: Role description for this agent
tools: [Read, Glob, Grep, Bash]
---

# My Agent

## Role
...
```

### 2. Add a Per-Project Extension

Create an `.md` file in `agents-ext/{project}/` (pure markdown, no frontmatter):

```markdown
### Project-Specific Rules

- Rule 1
- Rule 2
```

### 3. Register in Profile

`profiles/{project}.yaml`:

```yaml
agents:
  enabled: true
  include:
    - my-agent                     # base only
    - my-agent:                    # base + extension
        extensions: [my-agent]     # -> agents-ext/{project}/my-agent.md
```

### 4. Validate & Deploy

```bash
# Validate (check for missing references, frontmatter errors)
npm run validate

# Generate output/
npm run sync

# Apply to actual projects
npm run sync:apply
```

## Validation Checks (`validate.mjs`)

| Check | Description |
|-------|-------------|
| frontmatter validation | `name`, `description` required |
| include reference check | Verify that base agents referenced in profiles exist in `agents/` |
| extensions reference check | Verify that extensions referenced in profiles exist in `agents-ext/{project}/` |
| orphan check | Warn about files in `agents-ext/{project}/` not referenced by any profile |

## Sync Processing Flow

```
1. loadAgents('agents/')
   -> { planner: { frontmatter, body }, builder: { frontmatter, body }, ... }

2. loadBlocks('agents-ext/{project}/')
   -> { 'builder': '### MyApp design tokens...', ... }

3. assembleAgents(profile, baseAgents, projectExtBlocks)
   -> iterate include list
   -> if string: use base as-is
   -> if object: base body + extension append
   -> if overrides exist: additional append
   -> reassemble frontmatter + body

4. Write to output/{project}/.claude/agents/{name}.md

5. On --apply: copy to target_path/.claude/agents/
```

## Important Notes

- **When modifying base agents**: affects all projects using that agent -> `npm run sync:apply` required
- **Extensions are append-only**: added at end of base body (cannot insert in middle or modify existing content)
- **Frontmatter cannot be tampered with**: extensions cannot change `tools` (security)
- **No adapter used**: agents are Claude Code-only, so they are processed directly in `sync.mjs` without going through adapters
