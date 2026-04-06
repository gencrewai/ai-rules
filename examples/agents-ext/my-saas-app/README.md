# Agent Extension Examples

Agent extensions add project-specific instructions to base agent definitions.

## How It Works

Base agents live in `agents/` (e.g., `agents/builder.md`).
Extensions live in `agents-ext/{project}/` and are **appended** to the base agent body.

## Usage in Profile

```yaml
# profiles/my-saas-app.yaml
agents:
  enabled: true
  include:
    - planner                   # base only (no extension)
    - builder:
        extensions: [builder]   # → agents-ext/my-saas-app/builder.md appended
    - reviewer:
        extensions: [reviewer]  # → agents-ext/my-saas-app/reviewer.md appended
```

## Files in This Directory

| File | Purpose |
|------|---------|
| `builder.md` | Design token compliance, API standards, reference docs |
| `reviewer.md` | Design token verification checklist, API contract checks |

## Writing Your Own

- No YAML frontmatter needed (extensions are pure markdown)
- Content is appended to the base agent's body section
- Keep focused on project-specific rules — base agent handles the general patterns
