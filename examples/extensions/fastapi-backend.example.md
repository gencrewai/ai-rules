# fastapi-backend — FastAPI Backend Rules

> Example extension for a FastAPI-based SaaS backend.
> Copy and adapt for your project.

## Hard Bans

- **Layering**: No DB in Controller → Controller → Service → Repository
- **Auth**: All endpoints require `Depends(get_current_user)`
  - Exceptions: health check, OAuth callback, public reads — **comment required with reason**
- **Ownership**: Resource endpoints require ownership check (`resource.user_id != current_user.id` → 403)
- **Models**: New FK columns must have `ForeignKey("table.id")` + `index=True`
- **Security**: API responses must not include server paths (`file_path`) or stack traces
- **Logging**: No PII (email, token, user_id) in production logs

## Pre-Commit Self-Check

- [ ] `Depends(get_current_user)` applied (comment if exempted)
- [ ] Resource CRUD → ownership check
- [ ] Cost-incurring API (LLM/OCR) → Rate Limit applied
- [ ] File upload → Content-Type + size limit + filename sanitize
- [ ] FK columns + query columns → `index=True`
- [ ] Response contains no PII/server path/stack trace

## DB Changes

```bash
cd backend
alembic revision --autogenerate -m "description"
alembic upgrade head                              # local
docker compose exec backend alembic upgrade head  # staging/production
```
