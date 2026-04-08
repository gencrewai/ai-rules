# 02-code — Code Architecture Rules

## Hard Bans (auto-fail on violation)

> Rules below are organized by stack-neutral (common) / Frontend (React) / Backend (FastAPI).
> Projects with different stacks may override Frontend/Backend sections via extensions.

### Frontend (React)
- Never use `fetch`/`axios` directly in components → **hooks + React Query pattern**
- `dangerouslySetInnerHTML` requires `DOMPurify.sanitize()` — no exceptions
- `console.log`/`console.warn` require `import.meta.env.DEV` guard (`console.error` is allowed)
- Hardcoded color values (`#xxx`, `rgb()`) are forbidden → use CSS variables or Tailwind semantic classes
- Arbitrary spacing values (`p-[13px]`) are forbidden → use Tailwind standard scale
- Page components must use `lazy()` import (code splitting)
- Create/Edit forms must reuse a shared Form component → separate form files are forbidden
- Hardcoded UI text is forbidden → use `constants/` or i18n keys

### Backend (FastAPI)
- No DB access in controllers → **Controller → Service → Repository** 3-layer architecture
- Auth middleware required on all endpoints (document reason in comments if exempted)
- Ownership verification required on resource endpoints
- Index required on every new FK column
- API responses must never include server paths or stack traces
- `response_model` required on all API endpoints
- Counter columns (`count += 1`) are forbidden → use event table + aggregate query

### Common (stack-neutral — applies to all projects)
- Hardcoded secrets forbidden (API keys, passwords, etc.) — **guard-secrets.sh hook provides redundant detection at commit time** (`tooling.secret_scan`)
- Never log PII (email, token, user_id) in production
- Full repo scan forbidden — only read files referenced in CLAUDE.md, the docs index, or INTENT.md (if the project uses one)

## Architecture Principles

- No over-engineering — minimum complexity for current requirements
- No abstraction for fewer than 3 similar lines of code
- No single-use helpers or utilities
- No design for speculative future requirements

## Adding New Environment Variables

- `.env.example` update is required
- Must be noted in the completion report

## Database Changes

Alembic migration required:
```bash
cd backend
alembic revision --autogenerate -m "description"
alembic upgrade head  # local
docker compose exec backend alembic upgrade head  # staging/production
```

## Validation (required before commit)

**lint-staged + pre-commit hook runs automatically** (`tooling.lint_staged`):
- TS projects: `eslint --fix` (staged `.ts`/`.tsx` files)
- Python projects: `ruff check --fix` + `ruff format --check` (staged `.py` files)
- Mixed projects: both of the above

When manual validation is needed:
```bash
npx tsc --noEmit                    # Frontend type check
cd backend && ruff check .          # Backend lint
```
