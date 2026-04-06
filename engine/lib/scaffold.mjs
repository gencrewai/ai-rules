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
import { setupAiLogs } from './ai-logs.mjs'

// ── Path resolution ─────────────────────────────────────────────────────────
// Priority: explicit args > env vars > hardcoded defaults

export function resolvePaths(overrides = {}) {
  return {
    starterKitRoot: overrides.starterKitRoot
      ?? process.env.AI_RULES_STARTER_KIT_ROOT
      ?? '/path/to/starter-kit',
    aiRulesRoot: overrides.aiRulesRoot
      ?? process.env.AI_RULES_ROOT
      ?? '/path/to/ai-rules',
    devRoot: overrides.devRoot
      ?? process.env.AI_RULES_DEV_ROOT
      ?? '/path/to/projects',
  }
}

// ── Scaffolding ──────────────────────────────────────────────────────────

/**
 * @param {object} options
 * @param {string} options.name          Project name (kebab-case)
 * @param {string} [options.stack]       Preset stack
 * @param {boolean} [options.copyOutputDocs] Whether to copy output docs
 * @param {boolean} [options.gitInit]    Whether to init Git
 * @param {object}  [options.paths]      Path overrides
 * @returns {{ log: string[], isError: boolean }}
 */
export async function scaffoldProject(options) {
  const {
    name,
    stack = 'react-fastapi-postgres',
    copyOutputDocs = true,
    gitInit = true,
    paths: pathOverrides = {},
  } = options

  const paths = resolvePaths(pathOverrides)
  const log = []
  const projectDir = join(paths.devRoot, name)
  const outputDocsDir = join(paths.aiRulesRoot, 'output', name)

  try {
    // 1. Run init-project.mjs
    log.push('== Step 1: Scaffolding ==')
    const initCmd = `node scripts/init-project.mjs --name ${name} --stack ${stack} --no-interactive --force`
    const initResult = execSync(initCmd, {
      cwd: paths.starterKitRoot,
      encoding: 'utf-8',
      timeout: 30000,
    })
    log.push(initResult.trim())

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

      // 2.5 Copy agent files
      const agentsOutputDir = join(outputDocsDir, '.claude', 'agents')
      if (existsSync(agentsOutputDir)) {
        log.push('\n== Step 2.5: Agent File Copy ==')
        const agentDstDir = join(projectDir, '.claude', 'agents')
        mkdirSync(agentDstDir, { recursive: true })
        const agentFiles = readdirSync(agentsOutputDir).filter(f => f.endsWith('.md'))
        for (const af of agentFiles) {
          copyFileSync(join(agentsOutputDir, af), join(agentDstDir, af))
          log.push(`  COPY: .claude/agents/${af}`)
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
      const commitResult = execSync(
        `git commit -m "chore: initialize ${name} from AI SaaS starter kit"`,
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
