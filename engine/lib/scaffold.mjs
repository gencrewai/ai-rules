/**
 * scaffold — Core project scaffolding logic
 *
 * Imported by both MCP server and CLI.
 * Zero external dependencies — Node.js built-in modules only.
 */

import { execSync } from 'child_process'
import {
  copyFileSync, readFileSync, appendFileSync,
  existsSync, readdirSync, mkdirSync,
} from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { setupAiLogs } from './ai-logs.mjs'
import { bootstrapProject } from './bootstrap.mjs'
import { deployAgentsForTool, SCAFFOLD_AGENT_TOOLS } from './scaffold-agents.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const AI_RULES_ROOT_DEFAULT = join(__dirname, '..', '..')

// ── Path resolution ─────────────────────────────────────────────────────────
// Priority: explicit args > env vars > hardcoded defaults

export function resolvePaths(overrides = {}) {
  return {
    starterKitRoot: overrides.starterKitRoot
      ?? process.env.AI_RULES_STARTER_KIT_ROOT
      ?? null,
    aiRulesRoot: overrides.aiRulesRoot
      ?? process.env.AI_RULES_ROOT
      ?? AI_RULES_ROOT_DEFAULT,
    devRoot: overrides.devRoot
      ?? process.env.AI_RULES_DEV_ROOT
      ?? null,
  }
}

// ── Scaffolding ──────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {string} options.name          Project name (kebab-case)
 * @param {string} [options.stack]       Preset stack
 * @param {boolean} [options.copyOutputDocs] Whether to copy output docs
 * @param {boolean} [options.gitInit]    Whether to init Git
 * @param {string[]} [options.tools]     AI tools to deploy agents to
 *                                       (subset of SCAFFOLD_AGENT_TOOLS).
 *                                       Default ['claude-code'].
 * @param {object}  [options.paths]      Path overrides
 * @returns {{ log: string[], isError: boolean }}
 */
export async function scaffoldProject(options) {
  const {
    name,
    stack = 'react-fastapi-postgres',
    copyOutputDocs = true,
    gitInit = true,
    tools = ['claude-code'],
    paths: pathOverrides = {},
  } = options

  const paths = resolvePaths(pathOverrides)
  if (!paths.devRoot) {
    return {
      log: ['Error: --dev-root is required. Specify the directory where the project will be created.'],
      isError: true,
    }
  }
  const log = []
  const projectDir = join(paths.devRoot, name)
  const outputDocsDir = join(paths.aiRulesRoot, 'output', name)

  try {
    // 1. Bootstrap project
    log.push('== Step 1: Scaffolding ==')
    if (paths.starterKitRoot) {
      // External starter kit mode
      const initCmd = `node scripts/init-project.mjs --name ${name} --stack ${stack} --no-interactive --force`
      const initResult = execSync(initCmd, {
        cwd: paths.starterKitRoot,
        encoding: 'utf-8',
        timeout: 30000,
      })
      log.push(initResult.trim())
    } else {
      // Self-contained bootstrap (open-source default)
      const bootstrapLog = await bootstrapProject({
        projectDir,
        name,
        stack,
        aiRulesRoot: paths.aiRulesRoot,
      })
      log.push(...bootstrapLog)
    }

    // 2. Copy ai-rules output documents
    if (copyOutputDocs && existsSync(outputDocsDir)) {
      log.push('\n== Step 2: Document Copy ==')

      const docFiles = [
        { src: 'ROADMAP.md', dst: 'ROADMAP.md', mode: 'copy' },
        { src: 'INTENT.md', dst: 'INTENT.md', mode: 'copy' },
        { src: '.env', dst: '.env', mode: 'copy' },
        { src: 'docker-compose.dev.yml', dst: 'docker-compose.dev.yml', mode: 'copy' },
        { src: 'CLAUDE_RULES.md', dst: 'CLAUDE.md', mode: 'append' },
      ]

      for (const { src, dst, mode } of docFiles) {
        const srcPath = join(outputDocsDir, src)
        const dstPath = join(projectDir, dst)
        if (!existsSync(srcPath)) {
          log.push(`  SKIP: ${src} (not found)`)
          continue
        }
        if (mode === 'copy') {
          copyFileSync(srcPath, dstPath)
          log.push(`  COPY: ${src} → ${dst}`)
        } else if (mode === 'append') {
          const content = readFileSync(srcPath, 'utf-8')
          appendFileSync(dstPath, '\n' + content)
          log.push(`  APPEND: ${src} → ${dst}`)
        }
      }

      // 2.7 Copy docs/ reference documents
      const docsOutputDir = join(outputDocsDir, 'docs')
      if (existsSync(docsOutputDir)) {
        log.push('\n== Step 2.7: Reference Docs Copy ==')
        const copyDocsRecursive = (srcDir, relPath) => {
          for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
            const srcPath = join(srcDir, entry.name)
            const rel = relPath ? `${relPath}/${entry.name}` : entry.name
            if (entry.isDirectory()) {
              copyDocsRecursive(srcPath, rel)
            } else {
              const dstPath = join(projectDir, 'docs', rel)
              mkdirSync(dirname(dstPath), { recursive: true })
              copyFileSync(srcPath, dstPath)
              log.push(`  COPY: docs/${rel}`)
            }
          }
        }
        copyDocsRecursive(docsOutputDir, '')
      }

      // 2.8 Copy WORKLOG base directory
      const worklogOutputDir = join(outputDocsDir, 'WORKLOG')
      if (existsSync(worklogOutputDir)) {
        log.push('\n== Step 2.8: WORKLOG Base Directory Copy ==')
        const copyWorklogRecursive = (srcDir, relPath) => {
          for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
            const srcPath = join(srcDir, entry.name)
            const rel = relPath ? `${relPath}/${entry.name}` : entry.name
            if (entry.isDirectory()) {
              copyWorklogRecursive(srcPath, rel)
            } else {
              const dstPath = join(projectDir, 'WORKLOG', rel)
              mkdirSync(dirname(dstPath), { recursive: true })
              copyFileSync(srcPath, dstPath)
              log.push(`  COPY: WORKLOG/${rel}`)
            }
          }
        }
        copyWorklogRecursive(worklogOutputDir, '')
      }
    } else if (copyOutputDocs) {
      log.push('\n== Step 2: Document Copy SKIP (output folder not found) ==')
    }

    // 2.5 Agent deployment (multi-tool, independent of output docs).
    // Sources core/agents/ directly so scaffold works even without `sync`.
    // Rules files for non-Claude runners (AGENTS.md, .cursor/rules/, ...)
    // still require the sync engine.
    log.push(`\n== Step 2.5: Agent Deployment (tools: ${tools.join(', ')}) ==`)
    const unknownTools = tools.filter(t => !SCAFFOLD_AGENT_TOOLS.includes(t))
    if (unknownTools.length) {
      log.push(`  WARN: ignored unknown tool(s): ${unknownTools.join(', ')}`)
      log.push(`        supported by scaffold: ${SCAFFOLD_AGENT_TOOLS.join(', ')}`)
    }
    const enabledTools = tools.filter(t => SCAFFOLD_AGENT_TOOLS.includes(t))
    for (const tool of enabledTools) {
      log.push(`  — ${tool}`)
      await deployAgentsForTool({
        tool,
        aiRulesRoot: paths.aiRulesRoot,
        projectDir,
        logger: msg => log.push(`    ${msg}`),
      })
    }

    // 2.9 New project AI logs initial setup
    log.push('\n== Step 2.9: AI Logs Initial Setup ==')
    setupAiLogs({
      projectDir,
      aiRulesRoot: paths.aiRulesRoot,
      projectName: name,
      logger: message => log.push(`  ${message}`),
    })

    // 3. Git initialization
    if (gitInit) {
      log.push('\n== Step 3: Git Init ==')
      execSync('git init', { cwd: projectDir, encoding: 'utf-8' })
      execSync('git add -A', { cwd: projectDir, encoding: 'utf-8' })
      const commitMsg = paths.starterKitRoot
        ? `chore: initialize ${name} from AI SaaS starter kit`
        : `chore: initialize ${name} from ai-rules scaffold`
      const commitResult = execSync(
        `git commit -m "${commitMsg}"`,
        { cwd: projectDir, encoding: 'utf-8' }
      )
      log.push(commitResult.trim())
      // Create develop branch (prevent builder from committing directly to main)
      execSync('git checkout -b develop', { cwd: projectDir, encoding: 'utf-8' })
      log.push('develop branch created (main protected)')
    }

    // 4. Result summary
    const files = readdirSync(projectDir)
    log.push('\n== Complete ==')
    log.push(`Path: ${projectDir}`)
    log.push(`Files: ${files.join(', ')}`)
    log.push('\n== Next Steps ==')
    log.push('1. If you have a planning document, place it as SPEC.md in the project root')
    log.push('   (planner will automatically read it and cross-reference with the kickoff checklist)')
    log.push(`2. Start working in the project directory:`)
    log.push(`   cd ${projectDir} && claude`)
    log.push('   -> planner proceeds: kickoff checklist -> INTENT.md')

    return { log, isError: false }
  } catch (err) {
    log.push(`\nError: ${err.message}`)
    if (err.stdout) log.push(`stdout: ${err.stdout}`)
    if (err.stderr) log.push(`stderr: ${err.stderr}`)
    return { log, isError: true }
  }
}
