# Profile Examples

Profiles define how rules are assembled for each project.
One YAML file per project.

## How to Use

1. Copy `_default.yaml` to `profiles/my-project.yaml`
2. Set `project`, `target_path`, `github_repo`
3. Choose which `core` blocks to include
4. Add `extensions` if needed
5. Run `npm run sync` to generate output

## Profile Spectrum

| Profile | Use Case | Complexity |
|---------|----------|-----------|
| `_default.yaml` | Minimal starting point | Low |
| `standalone.example.yaml` | Independent fullstack project | Medium |
| `docs-project.example.yaml` | Docs-only or chatbot project | Low |
| `saas-fullstack.example.yaml` | Production SaaS with governance | High |

## Key Fields

```yaml
project: my-project          # Unique project name
target_path: /path/to/it     # Where to deploy generated rules
github_repo: org/repo         # For adapter URLs

tools:                        # Which AI tools to generate for
  claude-code: { enabled: true, output: CLAUDE.md }
  cursor: { enabled: false }

core: [01-git, 02-code, ...]  # Which core rules to include
extensions: [my-backend]      # Project-specific extensions
agents: { include: [planner, builder, reviewer] }

governance: { preset: solo }  # Governance level
tooling: { stack: ts }        # Tooling (commitlint, husky, etc.)
```
