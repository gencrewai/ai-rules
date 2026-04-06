# 08-local-env — Local Development Environment Safety Rules

## Purpose

Prevent port conflicts, DB overwrites, and environment variable pollution when developing multiple projects simultaneously.

---

## 1. Port Conflict Prevention

### Required Check on New Project Setup

When setting up a project for the first time, always check currently used ports and assign non-conflicting ones.

```bash
# Check currently used ports (Windows)
netstat -ano | findstr "LISTENING" | findstr ":3000\|:3001\|:4000\|:4001\|:8080"

# macOS / Linux
lsof -i :3000,3001,4000,8080 -P -n | grep LISTEN
```

If a conflict is found, **report to user immediately** — never change ports arbitrarily.

### Recommended Port Ranges by Role

| Role | Port Range | Notes |
|------|-----------|-------|
| Frontend (SPA/SSR) | 3000–3099 | One per project |
| Backend API | 4000–4099 | One per project |
| Backend (Python/FastAPI) | 8000–8099 | One per project |
| Admin / Storybook | 6000–6099 | Optional |
| DB GUI (Prisma Studio, etc.) | 5555–5599 | Optional |

**When running multiple projects on the same machine**, increment by 10:
- Project A: frontend=3000, api=4000
- Project B: frontend=3010, api=4010
- Project C: frontend=3020, api=4020

### Auto Port Discovery Pattern (standard for new projects)

**Node/Nuxt/Next frontend** — create `scripts/find-port.mjs` and wire it to the `package.json` dev script:

```javascript
// scripts/find-port.mjs
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'

const START_PORT = parseInt(process.env.PORT || '3000')
const MAX_TRY = 10

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => { server.close(); resolve(true) })
    server.listen(port, '0.0.0.0')
  })
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + MAX_TRY; port++) {
    if (await isPortAvailable(port)) return port
  }
  throw new Error(`All ports ${startPort}–${startPort + MAX_TRY - 1} are in use.`)
}

const port = await findAvailablePort(START_PORT)
if (port !== START_PORT) {
  console.log(`⚠️  Port ${START_PORT} in use — auto-switching to port ${port}.`)
}

// Adjust spawn command based on framework
// Nuxt:  ['nuxt', 'dev', '--port', String(port)]
// Next:  ['next', 'dev', '-p', String(port)]
// Vite:  ['vite', '--port', String(port)]
const child = spawn('nuxt', ['dev', '--port', String(port)], {
  stdio: 'inherit', shell: true,
  env: { ...process.env, PORT: String(port) }
})
child.on('exit', (code) => process.exit(code ?? 0))
```

```json
// package.json
{
  "scripts": {
    "dev": "node scripts/find-port.mjs"
  }
}
```

**Express/Hono/Fastify backend** — add auto port discovery to `src/index.ts` or entry point:

```typescript
// src/utils/find-port.ts
import { createServer } from 'node:net'

export async function findAvailablePort(startPort: number, maxTry = 10): Promise<number> {
  for (let port = startPort; port < startPort + maxTry; port++) {
    const available = await new Promise<boolean>((resolve) => {
      const server = createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => { server.close(); resolve(true) })
      server.listen(port, '0.0.0.0')
    })
    if (available) {
      if (port !== startPort) console.warn(`⚠️  Port ${startPort} in use — switching to ${port}`)
      return port
    }
  }
  throw new Error(`All ports ${startPort}–${startPort + maxTry - 1} are in use`)
}

// Usage in src/index.ts
const PORT = await findAvailablePort(Number(process.env.PORT ?? 4000))
app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`))
```

**Python FastAPI** — port discovery before uvicorn startup:

```python
# scripts/start.py
import socket, subprocess, sys

def is_port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) != 0

start = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
port = next((p for p in range(start, start + 10) if is_port_available(p)), None)
if port is None:
    raise RuntimeError(f"All ports {start}–{start+9} are in use")
if port != start:
    print(f"⚠️  Port {start} in use — switching to {port}")

subprocess.run(["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(port), "--reload"])
```

### .env.example Port Documentation Rules

```bash
# .env.example — ports must include comments explaining purpose and collision warnings
PORT=4000                  # Backend API port (ensure no conflict with other projects)
FRONTEND_PORT=3000         # Frontend port
# When running multiple projects on the same machine, increment ports by 10
# Example: ProjectA=3000/4000, ProjectB=3010/4010
```

---

## 2. DB Collision Prevention (New Project Setup)

Follow this order when setting up a new project:

### 2-1. Check Existing DB List

```bash
# PostgreSQL
psql -U postgres -c "\l" | grep -v template | grep -v "^$"

# Check for DB name duplicates across projects
find ~/dev -name ".env" -not -path "*/node_modules/*" 2>/dev/null \
  | xargs grep "DATABASE_URL" 2>/dev/null
```

### 2-2. Choose a Unique DB Name

| ✅ Correct | ❌ Forbidden |
|-----------|-------------|
| `mystudio_dev` | `myapp` (same as another project) |
| `my_saas_app_v2_dev` | `dev`, `test`, `app`, `database` |
| `my_store_local` | `postgres` |
| `my_engine_dev` | `mydb` |

### 2-3. Create DB

```bash
# Agent provides the command; human executes
createdb -U postgres {project_name}_dev

# Or
psql -U postgres -c "CREATE DATABASE {project_name}_dev;"
```

### 2-4. Configure .env

```bash
# .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/{project_name}_dev"
```

---

## 3. New Project Local Setup Checklist

The agent must follow this order when setting up a new project:

```
[ ] 1. Port conflict check — verify used ports and assign available ones
[ ] 2. DB name collision check — choose a name that doesn't conflict with existing projects
[ ] 3. Write .env — reflect the chosen port/DB name
[ ] 4. Sync .env.example — include keys + comments only, no actual values
[ ] 5. Check .gitignore — ensure .env is included
[ ] 6. Add find-port script — apply auto port discovery to both frontend and backend
[ ] 7. Write local setup guide in README — specify ports and DB name
```

---

## 4. Standard .gitignore Entries

Must be included in new project `.gitignore`:

```gitignore
# Environment variables — never commit
.env
.env.local
.env.*.local
!.env.example      # example is allowed

# DB dumps — local backup files
*.sql
*.dump
backup_*.sql

# Local dev tools
.prisma/
```

---

## 5. Agent Behavior Rules

| Situation | Agent Behavior |
|-----------|---------------|
| New project setup | Check port/DB collisions first, report results, then proceed |
| Port conflict detected | Report to user immediately — never change arbitrarily |
| DB name collision detected | Warn user immediately + suggest alternative names |
| Modifying .env file | Show before/after values and get user confirmation |
| PORT env var missing | Suggest adding find-port script |
