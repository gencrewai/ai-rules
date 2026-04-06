#!/usr/bin/env node
/**
 * new.mjs — Create a new ai-rules based project with a single project name
 *
 * Usage:
 *   npm run new -- my-project
 *   node scripts/new.mjs my-project
 */

import { createInterface } from 'node:readline'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'

import { scaffoldProject } from '../lib/scaffold.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DEFAULT_DEV_ROOT = process.env.AI_RULES_DEV_ROOT ?? '/path/to/projects'

const { positionals, values } = parseArgs({
  options: {
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
  strict: false,
})

if (values.help) {
  printHelp()
  process.exit(0)
}

let projectName = positionals[0]
if (!projectName) {
  projectName = await askProjectName()
}

if (!projectName) {
  console.error('Project name is required.')
  process.exit(1)
}

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projectName)) {
  console.error('Project name must be kebab-case. Example: legacy-refactor-bot')
  process.exit(1)
}

const profilePath = join(ROOT, 'profiles', `${projectName}.yaml`)
const targetPath = join(DEFAULT_DEV_ROOT, projectName)

if (existsSync(profilePath)) {
  console.error(`Profile already exists: profiles/${projectName}.yaml`)
  process.exit(1)
}

if (existsSync(targetPath)) {
  console.error(`Project directory already exists: ${targetPath}`)
  process.exit(1)
}

try {
  console.log(`\n[1/3] Creating profiles/${projectName}.yaml`)
  writeFileSync(profilePath, buildProfile(projectName, targetPath), 'utf-8')

  console.log(`[2/3] Generating ai-rules output`)
  execFileSync('node', ['scripts/sync.mjs', '--project', projectName], {
    cwd: ROOT,
    stdio: 'inherit',
  })

  console.log(`[3/3] Creating project from starter kit`)
  const result = await scaffoldProject({ name: projectName })
  console.log(result.log.join('\n'))

  if (result.isError) {
    process.exit(1)
  }

  console.log('\nUsage:')
  console.log(`  npm run new -- ${projectName}`)
} catch (error) {
  // Even if sync fails, the profile remains so leave a clear message for status.
  console.error(`\nCreation failed: ${error.message}`)
  process.exit(1)
}

function buildProfile(name, targetPath) {
  const templatePath = join(ROOT, 'profiles', '_default.yaml')
  const template = readFileSync(templatePath, 'utf-8')

  return template
    .replace('project: _default', `project: ${name}`)
    .replace('target_path: ""        # replace with actual path', `target_path: ${targetPath}`)
    .replace('github_repo: ""        # your-org/{repo-name} format', 'github_repo: ')
}

function printHelp() {
  console.log(`
ai-rules new — Create a new project with a single name

Usage:
  npm run new -- <project-name>
  node scripts/new.mjs <project-name>

Examples:
  npm run new -- legacy-refactor-bot
`.trim())
}

async function askProjectName() {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    const answer = await new Promise(resolve => {
      rl.question('Project name (kebab-case): ', resolve)
    })
    return String(answer).trim()
  } finally {
    rl.close()
  }
}
