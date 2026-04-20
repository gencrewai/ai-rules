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
import * as codexAdapter from '../adapters/codex.mjs'
import * as geminiAdapter from '../adapters/gemini.mjs'
import * as copilotAdapter from '../adapters/copilot.mjs'
import * as clineAdapter from '../adapters/cline.mjs'
import * as antigravityAdapter from '../adapters/antigravity.mjs'
import * as genericAdapter from '../adapters/generic.mjs'
import { setupAiLogs } from '../lib/ai-logs.mjs'
import * as governanceAdapter from '../adapters/governance.mjs'
import * as toolingAdapter from '../adapters/tooling.mjs'
import {
  hashContent,
  hashFile,
  readManifest,
  writeManifest,
  diffManifest,
  detectUserEdits,
  pruneOrphans,
} from '../lib/manifest.mjs'
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
    // Step 3A flags
    prune: { type: 'boolean', default: false },       // delete orphans from target
    uninstall: { type: 'boolean', default: false },   // remove everything in manifest
    force: { type: 'boolean', default: false },       // overwrite user-edited files / force prune
  },
  strict: false,
})

const ADAPTERS = {
  'claude-code': claudeCodeAdapter,
  cursor: cursorAdapter,
  windsurf: windsurfAdapter,
  plain: plainAdapter,
  chatbot: chatbotAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter,
  copilot: copilotAdapter,
  cline: clineAdapter,
  antigravity: antigravityAdapter,
  generic: genericAdapter,
}

/**
 * Resolve the adapter for a tool entry in a profile.
 *
 * Priority (first match wins):
 *   1. `config.adapter` explicitly set (e.g. `adapter: generic`)
 *   2. A built-in adapter keyed by the tool name (e.g. `claude-code`, `kilo` if registered)
 *   3. `generic` as a fallback — so operators can declare a new tool in YAML
 *      without shipping an adapter, as long as they provide `output` (+ path_rewrites).
 *
 * Returns { adapter, resolvedName } or null if no adapter exists.
 */
function resolveAdapter(toolName, config) {
  if (config.adapter && ADAPTERS[config.adapter]) {
    return { adapter: ADAPTERS[config.adapter], resolvedName: config.adapter }
  }
  if (ADAPTERS[toolName]) {
    return { adapter: ADAPTERS[toolName], resolvedName: toolName }
  }
  if (config.output) {
    return { adapter: ADAPTERS.generic, resolvedName: 'generic' }
  }
  return null
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
      const resolved = resolveAdapter(tool, config)
      if (!resolved) {
        console.warn(`  ⚠️ No adapter found: ${tool} (set 'adapter: generic' or provide 'output')`)
        continue
      }
      const { adapter, resolvedName } = resolved
      // Make tool name visible to the adapter (used by generic.mjs for labels)
      const enrichedConfig = { ...config, _toolName: tool }

      // cursor/chatbot requires named blocks
      const namedBlocks = [
        ...Object.entries(assembled.coreBlocks).map(([name, content]) => ({ name, content })),
        ...(profile.extensions || []).map(name => ({ name, content: allBlocks[name] || '' })),
      ]
      const input = (resolvedName === 'cursor' || resolvedName === 'chatbot')
        ? namedBlocks
        : assembled.blocks

      const files = adapter.generate(input, enrichedConfig, profile)
      outputFiles.push(...files.map(f => ({ ...f, tool })))
    }

    // 4.5 Generate agent files — delegated per-tool.
    //    Each adapter decides its own layout/format (native copy vs role rule).
    //    A tool that doesn't expose generateAgents is simply skipped; a tool
    //    with `agents: { enabled: false }` in its profile block is opted out.
    const projectExtBlocks = loadBlocks(join(agentExtDir, projectName))
    const agents = assembleAgents(profile, baseAgents, projectExtBlocks)
    if (agents.length > 0) {
      for (const [tool, config] of Object.entries(profile.tools || {})) {
        if (!config.enabled) continue
        if (config.agents?.enabled === false) continue
        const resolved = resolveAdapter(tool, config)
        if (!resolved?.adapter?.generateAgents) continue
        const enrichedConfig = { ...config, _toolName: tool }
        const files = resolved.adapter.generateAgents(agents, enrichedConfig, profile)
        outputFiles.push(...files.map(f => ({ ...f, tool: `${tool}-agents` })))
      }
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

    // 6. --apply / --uninstall: touch real project paths (manifest-aware)
    //    --apply          copy files, then detect orphans/user-edits, optionally --prune
    //    --uninstall      remove EVERY file listed in the previous manifest
    //    --force          overwrite user-edited files and prune even if edited
    const needsTargetAction = (args.apply || args.uninstall) && profile.target_path
    if (needsTargetAction) {
      const targetPaths = Array.isArray(profile.target_path)
        ? profile.target_path
        : [profile.target_path]
      const previousManifest = readManifest(outputDir)

      // --uninstall: remove everything in the previous manifest, skip the rest of --apply logic.
      if (args.uninstall) {
        if (!previousManifest) {
          console.log(`  ℹ️ no manifest found for ${projectName} — nothing to uninstall`)
        } else {
          console.log(`  🗑  uninstalling ${previousManifest.files.length} tracked file(s) from ${targetPaths.length} target(s)`)
          if (!args['dry-run']) {
            const report = pruneOrphans(previousManifest.files, targetPaths, { force: args.force })
            logPruneReport(report, '    ')
            // Remove the manifest itself on successful uninstall
            writeManifest(outputDir, {
              project: projectName,
              target_paths: targetPaths,
              synced_at: new Date().toISOString(),
              files: [],
            })
          } else {
            for (const entry of previousManifest.files) {
              for (const t of targetPaths) {
                console.log(`    [dry-run] 🗑  ${join(t, entry.path)}`)
              }
            }
          }
        }
        // skip --apply logic for this profile
        continue
      }

      // --apply path
      for (const targetPath of targetPaths) {
        if (!existsSync(targetPath)) {
          console.warn(`  ⚠️ target_path not found: ${targetPath} (skipped)`)
          continue
        }
        console.log(`  🎯 ${targetPath}`)

        // Edit-guard: detect files changed locally since last sync
        const prevFilesHere = (previousManifest?.files || []).filter(() => true)
        const edits = detectUserEdits(prevFilesHere, [targetPath])
        if (edits.length > 0) {
          console.log(`    ⚠️  ${edits.length} file(s) were edited locally since last sync:`)
          for (const e of edits) console.log(`       • ${e.path}`)
          if (!args.force && !args.yes) {
            console.log(`       (pass --force to overwrite them, or edit the source in ai-rules and re-sync)`)
          }
        }
        const editedSet = new Set(edits.map(e => e.path))

        const appliedEntries = []   // [{ path, hash, tool }]
        for (const file of outputFiles) {
          const src = join(outputDir, file.path)
          const dst = join(targetPath, file.path)
          mkdirSync(dirname(dst), { recursive: true })

          // Edit-guard skip (unless --force)
          if (!args.force && editedSet.has(file.path)) {
            console.log(`    🔒 → ${file.path} (locally edited, skipped; use --force to overwrite)`)
            continue
          }

          if (!args['dry-run']) {
            if (file.ifNotExists && existsSync(dst)) {
              console.log(`    ⏭️  → ${file.path} (already exists, skipped)`)
              continue
            }
            if (file.mergeJson && existsSync(dst)) {
              const merged = mergeSettingsJson(dst, src)
              if (merged.changed) {
                const content = JSON.stringify(merged.result, null, 2) + '\n'
                writeFileSync(dst, content, 'utf-8')
                console.log(`    🔀 → ${file.path} (merged)`)
                appliedEntries.push({ path: file.path, hash: hashContent(content), tool: file.tool })
              } else {
                console.log(`    ✅ → ${file.path} (already up to date)`)
                appliedEntries.push({ path: file.path, hash: hashFile(dst), tool: file.tool })
              }
              continue
            }
            cpSync(src, dst)
            if (file.executable) {
              try { chmodSync(dst, 0o755) } catch (_) { /* ignore on Windows */ }
            }
            console.log(`    📋 → ${file.path}`)
            appliedEntries.push({ path: file.path, hash: hashFile(dst), tool: file.tool })
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
          for (const logPath of aiLogFiles) {
            appliedEntries.push({ path: logPath, hash: hashFile(join(targetPath, logPath)), tool: 'ai-logs' })
          }
        }

        // Orphan handling: anything in previous manifest but not in this sync.
        const { orphans } = diffManifest(previousManifest, appliedEntries.map(e => e.path))
        if (orphans.length > 0) {
          if (args.prune) {
            console.log(`    🗑  pruning ${orphans.length} orphan(s)${args.force ? ' (force)' : ''}:`)
            if (!args['dry-run']) {
              const report = pruneOrphans(orphans, [targetPath], { force: args.force })
              logPruneReport(report, '       ')
            } else {
              for (const o of orphans) console.log(`       [dry-run] 🗑  ${join(targetPath, o.path)}`)
            }
          } else {
            console.log(`    ℹ️  ${orphans.length} orphan(s) from previous sync (pass --prune to remove):`)
            for (const o of orphans) console.log(`       • ${o.path}`)
          }
        }

        // Persist manifest (v2)
        if (!args['dry-run'] && appliedEntries.length > 0) {
          writeManifest(outputDir, {
            project: projectName,
            target_paths: targetPaths,
            synced_at: new Date().toISOString(),
            files: appliedEntries,
          })
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
 * Pretty-print a pruneOrphans() report under the given indent.
 */
function logPruneReport(report, indent = '') {
  for (const r of report.removed) console.log(`${indent}🗑  removed: ${r.path} (@ ${r.target})`)
  for (const r of report.skipped_user_edited) console.log(`${indent}🔒 kept (locally edited): ${r.path} — pass --force to remove`)
  for (const r of report.missing) console.log(`${indent}∅  already gone: ${r.path}`)
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
 * Assemble agent files based on profile agents section.
 *
 * Returns `{ name, frontmatter, body, content }` for every selected agent:
 *   - frontmatter: parsed YAML object (for adapters that need structured access)
 *   - body: body text after applying extensions/overrides
 *   - content: full markdown (frontmatter + body) for adapters that want
 *     to copy verbatim (e.g. claude-code)
 *
 * @returns {{ name: string, frontmatter: object, body: string, content: string }[]}
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

    // Parse frontmatter once so adapters can consume structured fields.
    let frontmatter = {}
    try {
      frontmatter = base.frontmatter ? (parseYaml(base.frontmatter) || {}) : {}
    } catch (_) {
      frontmatter = {}
    }

    const content = `---\n${base.frontmatter}\n---\n${body}`
    result.push({ name: agentName, frontmatter, body, content })
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
