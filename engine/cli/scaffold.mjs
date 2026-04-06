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
import { scaffoldProject } from '../lib/scaffold.mjs'

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
ai-rules scaffold — Create a new project from starter kit

Usage:
  node cli/scaffold.mjs --name <project-name> [options]

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
      --dev-root          Project creation root directory
                          (env: AI_RULES_DEV_ROOT, default: /path/to/projects)
      --starter-kit-root  Starter kit path
                          (env: AI_RULES_STARTER_KIT_ROOT)
      --ai-rules-root     ai-rules path
                          (env: AI_RULES_ROOT)

Examples:
  node cli/scaffold.mjs --name my-app
  node cli/scaffold.mjs --name my-app --stack next-fastapi-postgres --no-git
  node cli/scaffold.mjs --name my-app --dev-root /home/user/projects
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
    starterKitRoot: args['starter-kit-root'],
    aiRulesRoot: args['ai-rules-root'],
  },
})

console.log(result.log.join('\n'))
process.exit(result.isError ? 1 : 0)
