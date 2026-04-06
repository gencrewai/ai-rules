#!/usr/bin/env node
/**
 * sync.mjs — ai-rules main sync script
 *
 * Usage:
 *   node scripts/sync.mjs                    # generate output/ only
 *   node scripts/sync.mjs --apply            # output/ → copy to actual project paths
 *   node scripts/sync.mjs --project my-saas-app    # specific project only
 *   node scripts/sync.mjs --dry-run          # print diff only (no file writes)
 *   node scripts/sync.mjs --verify           # show new section/source diff vs existing output and wait for confirmation
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, cpSync, chmodSync, copyFileSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { parseArgs } from 'util'
import readline from 'readline'

import { load as parseYaml } from 'js-yaml'
import { mergeWithPreservedSections } from '../adapters/chatbot.mjs'
import * as claudeCodeAdapter from '../adapters/claude-code.mjs'
import * as cursorAdapter from '../adapters/cursor.mjs'
import * as windsurfAdapter from '../adapters/windsurf.mjs'
import * as plainAdapter from '../adapters/plain.mjs'
import * as chatbotAdapter from '../adapters/chatbot.mjs'
import { setupAiLogs } from '../lib/ai-logs.mjs'
import * as governanceAdapter from '../adapters/governance.mjs'
import * as toolingAdapter from '../adapters/tooling.mjs'
import { exportViewerData } from './export-viewer.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// CLI argument parsing
const { values: args } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    project: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    verify: { type: 'boolean', default: true },
    'skip-verify': { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },  // Skip confirmation in CI environments
  },
  strict: false,
})

const ADAPTERS = {
  'claude-code': claudeCodeAdapter,
  cursor: cursorAdapter,
  windsurf: windsurfAdapter,
  plain: plainAdapter,
  chatbot: chatbotAdapter,
}

// --skip-verify forcefully disables verify
const shouldVerify = args.verify && !args['skip-verify']

main()

async function main() {
  console.log('[ai-rules] sync starting...')

  // 1. Load core blocks
  const coreBlocks = loadBlocks(join(ROOT, 'core'))
  const extensionBlocks = loadBlocks(join(ROOT, 'extensions'))
  const allBlocks = { ...coreBlocks, ...extensionBlocks }

  // Load agents
  const baseAgents = loadAgents(join(ROOT, 'agents'))
  const agentExtDir = join(ROOT, 'agents-ext')

  // Inject extension blocks into claude-code adapter
  claudeCodeAdapter.setExtensionBlocks(extensionBlocks)

  // 2. Load profiles
  const profileDir = join(ROOT, 'profiles')
  const profileFiles = readdirSync(profileDir)
    .filter(f => f.endsWith('.yaml') && !f.startsWith('_'))

  for (const profileFile of profileFiles) {
    const projectName = basename(profileFile, '.yaml')

    // --project flag to process specific project only
    if (args.project && args.project !== projectName) continue

    const profile = parseYaml(readFileSync(join(profileDir, profileFile), 'utf-8'))
    console.log(`\n[${projectName}] processing...`)

    // 3. Assemble blocks
    const assembled = assembleBlocks(profile, allBlocks)

    // 4. Generate files per tool
    const outputFiles = []

    for (const [tool, config] of Object.entries(profile.tools || {})) {
      if (!config.enabled) continue
      const adapter = ADAPTERS[tool]
      if (!adapter) {
        console.warn(`  ⚠️ No adapter found: ${tool}`)
        continue
      }

      // cursor/chatbot requires named blocks
      const namedBlocks = [
        ...Object.entries(assembled.coreBlocks).map(([name, content]) => ({ name, content })),
        ...(profile.extensions || []).map(name => ({ name, content: allBlocks[name] || '' })),
      ]
      const input = (tool === 'cursor' || tool === 'chatbot')
        ? namedBlocks
        : assembled.blocks

      const files = adapter.generate(input, config, profile)
      outputFiles.push(...files.map(f => ({ ...f, tool })))
    }

    // 4.5 Generate agent files
    const projectExtBlocks = loadBlocks(join(agentExtDir, projectName))
    const agents = assembleAgents(profile, baseAgents, projectExtBlocks)
    for (const agent of agents) {
      outputFiles.push({
        path: `.claude/agents/${agent.name}.md`,
        content: agent.content,
        tool: 'agents',
      })
    }

    // 4.7 Copy docs files
    const docsConfig = profile.docs || []
    for (const docRef of docsConfig) {
      const srcPath = join(ROOT, 'docs', `${docRef}.md`)
      if (!existsSync(srcPath)) {
        console.warn(`  ⚠️ docs/${docRef}.md not found`)
        continue
      }
      const content = readFileSync(srcPath, 'utf-8')
      outputFiles.push({
        path: `docs/${docRef}.md`,
        content,
        tool: 'docs',
      })
    }

    // 4.85 Generate governance files
    if (profile.governance?.enabled) {
      const govFiles = governanceAdapter.generate(profile.governance, profile)
      for (const f of govFiles) {
        outputFiles.push({ ...f, tool: 'governance' })
      }
    }

    // 4.86 Generate tooling files (commitlint, husky, lint-staged, guard-secrets)
    if (profile.tooling?.enabled) {
      const toolingFiles = toolingAdapter.generate(profile.tooling, profile)
      for (const f of toolingFiles) {
        outputFiles.push({ ...f, tool: 'tooling' })
      }
    }

    // 4.8 Copy root files/directories
    const filesConfig = profile.files || []
    for (const fileRef of filesConfig) {
      const srcPath = join(ROOT, 'files', fileRef)
      if (!existsSync(srcPath)) {
        console.warn(`  ⚠️ files/${fileRef} not found`)
        continue
      }
      const content = readFileSync(srcPath, 'utf-8')
      outputFiles.push({
        path: fileRef,
        content,
        tool: 'files',
      })
    }

    // 5. Write to output/
    const outputDir = join(ROOT, 'output', projectName)

    // --verify: Show new section/source diff vs existing output (default ON, disable with --skip-verify)
    if (shouldVerify) {
      const warnings = []
      for (const file of outputFiles) {
        const outPath = join(outputDir, file.path)
        if (!existsSync(outPath)) {
          warnings.push({ type: 'NEW_FILE', path: file.path, source: file.tool })
          continue
        }
        const existing = readFileSync(outPath, 'utf-8')
        const newSections = extractNewSections(existing, file.content)
        if (newSections.length > 0) {
          warnings.push({ type: 'NEW_SECTIONS', path: file.path, source: file.tool, sections: newSections })
        }
      }

      if (warnings.length > 0) {
        console.log('\n  ⚠️  [verify] New content detected:')
        for (const w of warnings) {
          if (w.type === 'NEW_FILE') {
            console.log(`  📄 New file: ${w.path}  (source: ${w.source})`)
          } else {
            console.log(`  📝 ${w.path}  (source: ${w.source})`)
            for (const s of w.sections) {
              console.log(`     + ${s}`)
            }
          }
        }
        if (!args.yes) {
          const confirmed = await askConfirm('  Continue? [y/N] ')
          if (!confirmed) {
            console.log('  ❌ cancelled')
            process.exit(0)
          }
        }
      } else {
        console.log('  ✅ [verify] No new sections found')
      }
    }

    for (const file of outputFiles) {
      const outPath = join(outputDir, file.path)
      mkdirSync(dirname(outPath), { recursive: true })

      let content = file.content
      // chatbot: preserve tag processing
      if (file.merge && profile.target_path) {
        const targetPath = join(profile.target_path, file.path)
        content = mergeWithPreservedSections(targetPath, content)
      }

      if (!args['dry-run']) {
        writeFileSync(outPath, content, 'utf-8')
        if (file.executable) {
          try { chmodSync(outPath, 0o755) } catch (_) { /* ignore on Windows */ }
        }
        console.log(`  ✅ ${file.path}`)
      } else {
        console.log(`  [dry-run] ${file.path} (${content.length} chars)`)
      }
    }

    // 6. --apply: copy to actual project paths (supports both array/string)
    if (args.apply && profile.target_path) {
      const targetPaths = Array.isArray(profile.target_path)
        ? profile.target_path
        : [profile.target_path]

      for (const targetPath of targetPaths) {
        if (!existsSync(targetPath)) {
          console.warn(`  ⚠️ target_path not found: ${targetPath} (skipped)`)
          continue
        }
        console.log(`  🎯 ${targetPath}`)
        const appliedFiles = []
        for (const file of outputFiles) {
          const src = join(outputDir, file.path)
          const dst = join(targetPath, file.path)
          mkdirSync(dirname(dst), { recursive: true })
          if (!args['dry-run']) {
            // ifNotExists: do not overwrite existing files
            if (file.ifNotExists && existsSync(dst)) {
              console.log(`    ⏭️  → ${file.path} (already exists, skipped)`)
              continue
            }
            // mergeJson: deep merge new content into existing JSON (for hooks merging)
            if (file.mergeJson && existsSync(dst)) {
              const merged = mergeSettingsJson(dst, src)
              if (merged.changed) {
                writeFileSync(dst, JSON.stringify(merged.result, null, 2) + '\n', 'utf-8')
                console.log(`    🔀 → ${file.path} (merged)`)
                appliedFiles.push(file.path)
              } else {
                console.log(`    ✅ → ${file.path} (already up to date)`)
              }
              continue
            }
            cpSync(src, dst)
            if (file.executable) {
              try { chmodSync(dst, 0o755) } catch (_) { /* ignore on Windows */ }
            }
            console.log(`    📋 → ${file.path}`)
            appliedFiles.push(file.path)
          } else {
            const skipNote = file.ifNotExists && existsSync(dst) ? ' [ifNotExists: skip]' : ''
            const mergeNote = file.mergeJson && existsSync(dst) ? ' [mergeJson]' : ''
            console.log(`    [dry-run] → ${dst}${skipNote}${mergeNote}`)
          }
        }

        const aiLogFiles = setupAiLogs({
          projectDir: targetPath,
          aiRulesRoot: ROOT,
          projectName,
          dryRun: args['dry-run'],
          logger: message => console.log(`    ${message}`),
        })

        if (!args['dry-run']) {
          appliedFiles.push(...aiLogFiles)
        }

        // Write sync-status.json
        if (!args['dry-run'] && appliedFiles.length > 0) {
          const statusPath = join(outputDir, 'sync-status.json')
          writeFileSync(statusPath, JSON.stringify({
            project: projectName,
            target_paths: targetPaths,
            synced_at: new Date().toISOString(),
            files: appliedFiles,
          }, null, 2), 'utf-8')
        }
      }
    }
  }

  console.log('\n[ai-rules] sync complete')
  if (!args.apply) {
    console.log('  → To apply to actual projects: node scripts/sync.mjs --apply')
  }

  // Update viewer data.json (skip on dry-run)
  if (!args['dry-run']) {
    try {
      exportViewerData()
      console.log('\n[ai-rules] viewer data.json updated')
    } catch (e) {
      console.warn('\n[ai-rules] viewer data.json update failed (ignored):', e.message)
    }
  }
}

/**
 * Extract added ## section headers from new content compared to existing content
 */
function extractNewSections(existing, next) {
  const existingHeaders = new Set(
    [...existing.matchAll(/^#{1,3} .+/gm)].map(m => m[0].trim())
  )
  return [...next.matchAll(/^#{1,3} .+/gm)]
    .map(m => m[0].trim())
    .filter(h => !existingHeaders.has(h))
}

/**
 * Request y/N confirmation via readline
 */
function askConfirm(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, answer => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

/**
 * Load .md files from directory as { name: content } map
 */
function loadBlocks(dir) {
  if (!existsSync(dir)) return {}
  return Object.fromEntries(
    readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => [basename(f, '.md'), readFileSync(join(dir, f), 'utf-8')])
  )
}

/**
 * Separate frontmatter (---...---)
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { frontmatter: '', body: content }
  return { frontmatter: match[1].replace(/\r/g, ''), body: match[2] }
}

/**
 * Load .md files from agents/ directory as { name: { frontmatter, body } } map
 */
function loadAgents(dir) {
  if (!existsSync(dir)) return {}
  return Object.fromEntries(
    readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const raw = readFileSync(join(dir, f), 'utf-8')
        const { frontmatter, body } = parseFrontmatter(raw)
        return [basename(f, '.md'), { frontmatter, body }]
      })
  )
}

/**
 * Assemble agent files based on profile agents section
 * @returns {{ name: string, content: string }[]}
 */
function assembleAgents(profile, baseAgents, agentExtBlocks) {
  const agentsConfig = profile.agents
  if (!agentsConfig || !agentsConfig.enabled) return []

  const include = agentsConfig.include || []
  const overrides = agentsConfig.overrides || {}
  const result = []

  for (const item of include) {
    let agentName, extensions = []

    if (typeof item === 'string') {
      agentName = item
    } else {
      // { builder: { extensions: [...] } } format
      agentName = Object.keys(item)[0]
      extensions = item[agentName].extensions || []
    }

    const base = baseAgents[agentName]
    if (!base) {
      console.warn(`  ⚠️ Agent not found: ${agentName}`)
      continue
    }

    // base body + extension blocks + overrides
    let body = base.body
    for (const extName of extensions) {
      const ext = agentExtBlocks[extName]
      if (ext) body += '\n\n' + ext.trim()
      else console.warn(`  ⚠️ Agent extension not found: ${extName}`)
    }
    if (overrides[agentName]) {
      body += '\n\n' + overrides[agentName].trim()
    }

    // Reassemble frontmatter + body
    const content = `---\n${base.frontmatter}\n---\n${body}`
    result.push({ name: agentName, content })
  }

  return result
}

/**
 * Assemble blocks + overrides patch based on profile
 */
function assembleBlocks(profile, allBlocks) {
  const coreNames = profile.core || []
  const extNames = profile.extensions || []
  const overrides = profile.overrides || {}

  const coreBlockMap = {}
  for (const name of coreNames) {
    let content = allBlocks[name] || `<!-- core '${name}' not found -->`
    // Override patch (append to end of block)
    if (overrides[name]) {
      content += '\n\n' + overrides[name].trim()
    }
    coreBlockMap[name] = content
  }

  const extBlocks = extNames.map(name => allBlocks[name] || `<!-- extension '${name}' not found -->`)

  const blocks = [...Object.values(coreBlockMap), ...extBlocks]

  return { blocks, coreBlocks: coreBlockMap }
}

/**
 * .claude/settings.json merge
 * - existing: Project current settings.json
 * - incoming: ai-rules generated settings.json (including hooks)
 * - Strategy:
 *   - hooks: merge as union per event → matcher → command
 *     (correctly merges even when governance and tooling independently generate settings.json)
 *   - permissions.allow: union of existing + incoming
 *   - other keys: preserve existing
 * @returns {{ result: object, changed: boolean }}
 */
function mergeSettingsJson(existingPath, incomingPath) {
  let existing = {}
  let incoming = {}
  try { existing = JSON.parse(readFileSync(existingPath, 'utf-8')) } catch (_) {}
  try { incoming = JSON.parse(readFileSync(incomingPath, 'utf-8')) } catch (_) {}

  const result = { ...existing }

  // hooks section: merge as union per event → matcher → command
  if (incoming.hooks) {
    result.hooks = result.hooks || {}
    for (const [event, incomingEntries] of Object.entries(incoming.hooks)) {
      const existingEntries = result.hooks[event] || []
      const merged = [...existingEntries]

      for (const entry of incomingEntries) {
        const matchKey = entry.matcher || '__no_matcher__'
        const existing = merged.find(e => (e.matcher || '__no_matcher__') === matchKey)
        if (existing) {
          // same matcher: command-level union
          const existingCommands = new Set(existing.hooks.map(h => h.command))
          for (const hook of entry.hooks) {
            if (!existingCommands.has(hook.command)) {
              existing.hooks.push(hook)
            }
          }
        } else {
          // new matcher: add entry
          merged.push(entry)
        }
      }
      result.hooks[event] = merged
    }
  }

  // permissions.allow: preserve existing + add incoming (deduplicated)
  if (incoming.permissions?.allow) {
    const existingAllow = existing.permissions?.allow ?? []
    const incomingAllow = incoming.permissions?.allow ?? []
    const merged = [...new Set([...existingAllow, ...incomingAllow])]
    result.permissions = { ...(existing.permissions ?? {}), allow: merged }
  }

  const changed = JSON.stringify(result) !== JSON.stringify(existing)
  return { result, changed }
}
