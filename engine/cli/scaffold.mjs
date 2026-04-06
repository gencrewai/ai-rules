#!/usr/bin/env node
/**
 * ai-rules CLI — scaffold
 *
 * Usage:
 *   node cli/scaffold.mjs --name <project-name> [options]
 *
 * Zero external dependencies — Node.js built-in modules only.
 * Can run in air-gapped environments where npm install is unavailable.
 */

import { parseArgs } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scaffoldProject } from '../lib/scaffold.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const AI_RULES_ROOT = join(__dirname, '..', '..')

// ── Argument Parsing ─────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    name:               { type: 'string',  short: 'n' },
    stack:              { type: 'string',  short: 's', default: 'react-fastapi-postgres' },
    'no-docs':          { type: 'boolean', default: false },
    'no-git':           { type: 'boolean', default: false },
    'dev-root':         { type: 'string' },
    'starter-kit-root': { type: 'string' },
    'ai-rules-root':    { type: 'string' },
    help:               { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
})

// ── Help ────────────────────────────────────────────────────────────

if (args.help || !args.name) {
  console.log(`
ai-rules scaffold — Create a new project with ai-rules

Usage:
  node engine/cli/scaffold.mjs --name <project-name> [options]

Required:
  -n, --name              Project name (kebab-case, e.g., my-app)

Options:
  -s, --stack             Preset stack (default: react-fastapi-postgres)
                          Available: react-fastapi-postgres, next-fastapi-postgres,
                                    react-express-postgres, react-express-mongodb,
                                    next-none-none
      --no-docs           Skip output document copy
      --no-git            Skip Git initialization
  -h, --help              Help

Path overrides (CLI args or env vars):
      --dev-root          Project creation root directory (required)
                          (env: AI_RULES_DEV_ROOT)
      --ai-rules-root     ai-rules repo path (auto-detected from CLI location)
                          (env: AI_RULES_ROOT)
      --starter-kit-root  Optional. External starter kit path
                          (env: AI_RULES_STARTER_KIT_ROOT)
                          If omitted, uses built-in bootstrap (no external deps)

Examples:
  node engine/cli/scaffold.mjs --name my-app --dev-root .
  node engine/cli/scaffold.mjs --name my-app --dev-root /home/user/projects
  node engine/cli/scaffold.mjs --name my-app --dev-root D:\\dev --stack next-none-none --no-git
`.trim())
  process.exit(args.help ? 0 : 1)
}

// ── Execution ──────────────────────────────────────────────────────────────

const result = await scaffoldProject({
  name: args.name,
  stack: args.stack,
  copyOutputDocs: !args['no-docs'],
  gitInit: !args['no-git'],
  paths: {
    devRoot: args['dev-root'],
    starterKitRoot: args['starter-kit-root'] || null,
    aiRulesRoot: args['ai-rules-root'] || AI_RULES_ROOT,
  },
})

console.log(result.log.join('\n'))
process.exit(result.isError ? 1 : 0)
