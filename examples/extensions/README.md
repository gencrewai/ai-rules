# Extension Examples

Extensions are project-specific rule blocks that supplement the core rules.

## How to Use

1. Create your extension file in `extensions/` directory
2. Reference it in your profile YAML:

```yaml
# profiles/my-project.yaml
extensions:
  - my-backend-rules
  - my-ci-rules
```

3. Run `npm run sync` to generate output

## Naming Convention

`{project}-{domain}.md` — e.g., `my-app-backend.md`, `my-app-ci.md`

## Examples in This Directory

| File | Use Case |
|------|----------|
| `fastapi-backend.example.md` | FastAPI backend rules (auth, layering, DB) |
| `react-frontend.example.md` | React frontend rules (design tokens, CSS) |
| `ci-safety-net.example.md` | 3-layer CI protection system |
| `contract-driven.example.md` | Behavior contract system (COMPLETED-FEATURES.md) |
| `chatbot-heartbeat.example.md` | Messaging bot heartbeat and group chat rules |
