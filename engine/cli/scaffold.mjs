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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scaffoldProject } from '../lib/scaffold.mjs'
import { parseToolsArg, SCAFFOLD_AGENT_TOOLS } from '../lib/scaffold-agents.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const AI_RULES_ROOT = join(__dirname, '..', '..')
const AI_RULES_PARENT = join(AI_RULES_ROOT, '..')

// ── Argument Parsing ─────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    name:               { type: 'string',  short: 'n' },
    stack:              { type: 'string',  short: 's', default: 'react-fastapi-postgres' },
    tools:              { type: 'string',  short: 't' },
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
  -t, --tools             Comma-separated AI runners to deploy agents to.
                          Default: claude-code
                          Supported: ${SCAFFOLD_AGENT_TOOLS.join(', ')}
                          Note: cursor requires \`npm install\` in ai-rules repo.
                          For Gemini / Windsurf / Copilot / Cline / Antigravity /
                          long-tail runners, use the sync engine (npm run sync).
      --no-docs           Skip output document copy
      --no-git            Skip Git initialization
  -h, --help              Help

Path overrides (CLI args or env vars):
      --dev-root          Project creation directory
                          (default: ai-rules parent directory)
                          (env: AI_RULES_DEV_ROOT)
      --ai-rules-root     ai-rules repo path (auto-detected from CLI location)
                          (env: AI_RULES_ROOT)
      --starter-kit-root  Optional. External starter kit path
                          (env: AI_RULES_STARTER_KIT_ROOT)
                          If omitted, uses built-in bootstrap (no external deps)

Examples:
  node engine/cli/scaffold.mjs --name my-app
  node engine/cli/scaffold.mjs --name my-app --dev-root D:\\dev
  node engine/cli/scaffold.mjs --name my-app --stack next-none-none --no-git
  node engine/cli/scaffold.mjs --name my-app --tools claude-code,codex,cursor
`.trim())
  process.exit(args.help ? 0 : 1)
}

// ── Execution ──────────────────────────────────────────────────────────────

const devRoot = args['dev-root']
  ? resolve(args['dev-root'])
  : AI_RULES_PARENT

const { tools, unknown: unknownTools } = parseToolsArg(args.tools)
if (unknownTools.length) {
  console.warn(`warning: ignoring unsupported tool(s): ${unknownTools.join(', ')}`)
  console.warn(`         supported by scaffold: ${SCAFFOLD_AGENT_TOOLS.join(', ')}`)
  console.warn(`         for other runners, use the sync engine (npm run sync)`)
}

const result = await scaffoldProject({
  name: args.name,
  stack: args.stack,
  copyOutputDocs: !args['no-docs'],
  gitInit: !args['no-git'],
  tools,
  paths: {
    devRoot,
    starterKitRoot: args['starter-kit-root'] || null,
    aiRulesRoot: args['ai-rules-root'] || AI_RULES_ROOT,
  },
})

console.log(result.log.join('\n'))
process.exit(result.isError ? 1 : 0)
