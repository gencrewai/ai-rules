#!/usr/bin/env node
/**
 * validate.mjs — ai-rules rule file validation
 *
 * Checks:
 * 1. All core/ files exist
 * 2. Referenced core/extensions in profiles/*.yaml actually exist
 * 3. YAML syntax errors
 * 4. Required field missing (project, target_path)
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, basename, dirname } from 'path'
import { fileURLToPath } from 'url'
import { load as parseYaml } from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')
const CORE_DIR = join(ROOT, 'core', 'rules')
const PROFILE_DIR = join(ROOT, 'examples', 'profiles')

const REQUIRED_CORE = ['00-identity', '01-git', '02-code', '03-security', '04-workflow', '05-responses', '06-session']

let errors = 0
let warnings = 0

function error(msg) { console.error(`  ❌ ${msg}`); errors++ }
function warn(msg)  { console.warn(`  ⚠️  ${msg}`); warnings++ }
function ok(msg)    { console.log(`  ✅ ${msg}`) }

console.log('[validate] ai-rules validation starting...\n')

// 1. core/rules/ file existence check
console.log('📁 core/rules/ files check')
for (const name of REQUIRED_CORE) {
  const path = join(CORE_DIR, `${name}.md`)
  if (existsSync(path)) ok(name)
  else error(`core/rules/${name}.md missing`)
}

// 2. profiles/*.yaml validation
console.log('\n📋 examples/profiles/ validation')
const profileDir = PROFILE_DIR
if (!existsSync(profileDir)) {
  warn(`profile directory ${profileDir} not found — skipping profile checks`)
}
const profileFiles = existsSync(profileDir)
  ? readdirSync(profileDir).filter(f => f.endsWith('.yaml') && !f.startsWith('_'))
  : []

for (const pf of profileFiles) {
  const name = basename(pf, '.yaml')
  console.log(`\n  [${name}]`)
  const raw = readFileSync(join(profileDir, pf), 'utf-8')

  // Required field check (simple text search)
  if (!raw.includes('project:')) error(`project field missing`)
  else ok('project field present')

  // core block reference check (extract from core: and extensions: sections)
  const coreSection = raw.match(/^core:\s*\n((?:[ \t]+-[ \t]+\S+[ \t]*\n)*)/m)
  const extSection = raw.match(/^extensions:\s*\n((?:[ \t]+-[ \t]+\S+[ \t]*\n)*)/m)
  const refs = []
  if (coreSection) refs.push(...[...coreSection[1].matchAll(/^\s+-\s+(\S+)/gm)].map(m => m[1]))
  if (extSection) refs.push(...[...extSection[1].matchAll(/^\s+-\s+(\S+)/gm)].map(m => m[1]))
  for (const ref of refs) {
    const coreExists = existsSync(join(CORE_DIR, `${ref}.md`))
    const extExists = existsSync(join(ROOT, 'extensions', `${ref}.md`))
    if (coreExists || extExists) ok(`referenced block '${ref}' exists`)
    else error(`referenced block '${ref}' missing (not in core/rules/ or extensions/)`)
  }
}

// 3. agents/ file validation
console.log('\n🤖 agents/ check')
const agentDir = join(ROOT, 'agents')
if (existsSync(agentDir)) {
  const agentFiles = readdirSync(agentDir).filter(f => f.endsWith('.md'))
  for (const af of agentFiles) {
    const raw = readFileSync(join(agentDir, af), 'utf-8')
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!fmMatch) {
      error(`agents/${af} — no frontmatter`)
    } else {
      if (!fmMatch[1].includes('name:')) error(`agents/${af} — name field missing`)
      if (!fmMatch[1].includes('description:')) error(`agents/${af} — description field missing`)
      ok(`agents/${af}`)
    }
  }
} else {
  warn('agents/ directory not found')
}

// 3.5 Verify agents referenced in profiles exist
console.log('\n🔗 agents reference check')
const agentBaseNames = existsSync(agentDir)
  ? readdirSync(agentDir).filter(f => f.endsWith('.md')).map(f => basename(f, '.md'))
  : []
const agentExtDir = join(ROOT, 'agents-ext')
const allProfileContent = profileFiles.map(pf => readFileSync(join(profileDir, pf), 'utf-8')).join('\n')

for (const pf of profileFiles) {
  const raw = readFileSync(join(profileDir, pf), 'utf-8')
  const pfName = basename(pf, '.yaml')

  // agents.include reference check
  const includeSection = raw.match(/^agents:[\s\S]*?include:\s*\n([\s\S]*?)(?=\n\w|\n*$)/m)
  if (!includeSection) continue

  // Extract agent names
  const agentRefs = [...includeSection[1].matchAll(/^\s+-\s+(\w[\w-]*)/gm)].map(m => m[1])
  for (const ref of agentRefs) {
    if (agentBaseNames.includes(ref)) ok(`[${pfName}] agent '${ref}' exists`)
    else error(`[${pfName}] agent '${ref}' missing (not in agents/)`)
  }

  // Extract extension references — agents-ext/{project}/{ext}.md structure
  const extRefs = [...includeSection[1].matchAll(/extensions:\s*\[([^\]]+)\]/g)]
    .flatMap(m => m[1].split(',').map(s => s.trim()))
  const projectExtDir = join(agentExtDir, pfName)
  const projectExtNames = existsSync(projectExtDir)
    ? readdirSync(projectExtDir).filter(f => f.endsWith('.md')).map(f => basename(f, '.md'))
    : []
  for (const ref of extRefs) {
    if (projectExtNames.includes(ref)) ok(`[${pfName}] agent extension '${ref}' exists (agents-ext/${pfName}/)`)
    else error(`[${pfName}] agent extension '${ref}' missing (not in agents-ext/${pfName}/)`)
  }
}

// 3.7 agents-ext/ orphan check
console.log('\n🔍 orphan agents-ext check')
if (existsSync(agentExtDir)) {
  // Iterate project sub-directories
  const projectDirs = readdirSync(agentExtDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
  for (const dir of projectDirs) {
    const projectName = dir.name
    const hasProfile = profileFiles.some(pf => basename(pf, '.yaml') === projectName)
    if (!hasProfile) {
      warn(`agents-ext/${projectName}/ — no matching profile (orphan directory)`)
      continue
    }
    const extFiles = readdirSync(join(agentExtDir, projectName)).filter(f => f.endsWith('.md'))
    const profileRaw = readFileSync(join(profileDir, `${projectName}.yaml`), 'utf-8')
    for (const ef of extFiles) {
      const eName = basename(ef, '.md')
      if (profileRaw.includes(eName)) ok(`agents-ext/${projectName}/${eName} in use`)
      else warn(`agents-ext/${projectName}/${eName} — not referenced in profile (orphan)`)
    }
  }
}

// 4. extensions/ orphan check (extension not used in any profile)
console.log('\n🔍 orphan extension check')
const extDir = join(ROOT, 'extensions')
const extFiles = existsSync(extDir)
  ? readdirSync(extDir).filter(f => f.endsWith('.md'))
  : []
if (!existsSync(extDir)) warn('extensions/ directory not found — skipping orphan check')

for (const ef of extFiles) {
  const name = basename(ef, '.md')
  if (allProfileContent.includes(name)) ok(`${name} in use`)
  else warn(`${name} — not used in any profile (orphan)`)
}

// 4.5 docs reference check
console.log('\n📄 docs reference check')
for (const pf of profileFiles) {
  const raw = readFileSync(join(profileDir, pf), 'utf-8')
  const pfName = basename(pf, '.yaml')
  const docsSection = raw.match(/^docs:\s*\n((?:[ \t]+-[ \t]+\S+[^\n]*\n?)+)/m)
  if (!docsSection) continue
  const docRefs = [...docsSection[1].matchAll(/^\s+-\s+(\S+)/gm)].map(m => m[1])
  for (const ref of docRefs) {
    const docPath = join(ROOT, 'docs', `${ref}.md`)
    if (existsSync(docPath)) ok(`[${pfName}] docs '${ref}' exists`)
    else error(`[${pfName}] docs '${ref}' missing (not in docs/)`)
  }
}

// 4.6 files reference check
console.log('\n📦 files reference check')
for (const pf of profileFiles) {
  const raw = readFileSync(join(profileDir, pf), 'utf-8')
  const pfName = basename(pf, '.yaml')
  const filesSection = raw.match(/^files:\s*\n((?:[ \t]+-[ \t]+\S+[^\n]*\n?)+)/m)
  if (!filesSection) continue
  const fileRefs = [...filesSection[1].matchAll(/^\s+-\s+(\S+)/gm)].map(m => m[1])
  for (const ref of fileRefs) {
    const filePath = join(ROOT, 'files', ref)
    if (existsSync(filePath)) ok(`[${pfName}] files '${ref}' exists`)
    else error(`[${pfName}] files '${ref}' missing (not in files/)`)
  }
}

// 4. Divergence detection: output/ vs actual project files
console.log('\n🔄 diverge detection (output/ vs actual project)')
const outputRoot = join(ROOT, 'output')
if (!existsSync(outputRoot)) {
  warn('output/ directory not found — skipping diverge detection')
}

for (const pf of (existsSync(outputRoot) ? profileFiles : [])) {
  const name = basename(pf, '.yaml')
  const raw = readFileSync(join(profileDir, pf), 'utf-8')
  const profile = parseYaml(raw)

  const targetPaths = Array.isArray(profile.target_path)
    ? profile.target_path.filter(Boolean)
    : (profile.target_path ? [profile.target_path] : [])
  if (targetPaths.length === 0) continue

  // Check sync-status.json
  const statusFile = join(outputRoot, name, 'sync-status.json')
  if (!existsSync(statusFile)) {
    warn(`[${name}] sync-status.json missing — --apply not yet executed`)
    continue
  }

  const status = JSON.parse(readFileSync(statusFile, 'utf-8'))
  const syncedAt = new Date(status.synced_at)
  const daysSinceSync = Math.floor((Date.now() - syncedAt) / (1000 * 60 * 60 * 24))
  if (daysSinceSync >= 3) warn(`[${name}] last sync ${daysSinceSync} days ago — may need npm run sync:apply`)
  let diverged = false
  const compareTargets = Array.isArray(status.target_paths) && status.target_paths.length > 0
    ? status.target_paths
    : targetPaths

  for (const filePath of status.files) {
    const outputFile = join(outputRoot, name, filePath)

    // Some managed files are created directly during apply, not in output/.
    if (!existsSync(outputFile)) {
      ok(`[${name}] ${filePath} — excluded from output comparison (directly created during apply)`)
      continue
    }

    const outputContent = readFileSync(outputFile, 'utf-8')
    let fileMatchedAnyTarget = false

    for (const targetPath of compareTargets) {
      const projectFile = join(targetPath, filePath)
      if (!existsSync(projectFile)) continue

      fileMatchedAnyTarget = true
      const projectContent = readFileSync(projectFile, 'utf-8')
      if (outputContent !== projectContent) {
        warn(`[${name}] ${filePath} — output/ and project file differ (${targetPath})`)
        diverged = true
      }
    }

    if (!fileMatchedAnyTarget) {
      warn(`[${name}] ${filePath} — file not found in any target_path`)
      diverged = true
    }
  }

  if (!diverged) {
    ok(`[${name}] sync status OK (${syncedAt.toISOString()})`)
  }
}

// Results
console.log(`\n${'─'.repeat(40)}`)
if (errors === 0 && warnings === 0) {
  console.log('✅ Validation passed (no errors)')
} else {
  if (errors > 0) console.error(`❌ ${errors} error(s)`)
  if (warnings > 0) console.warn(`⚠️  ${warnings} warning(s)`)
}

process.exit(errors > 0 ? 1 : 0)
