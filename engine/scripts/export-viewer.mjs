/**
 * export-viewer.mjs — Generate viewer/public/data.json
 *
 * Parses profiles/*.yaml + core/*.md + extensions/*.md + agents/*.md →
 * Generates data.json consumed by the Astro viewer at build time.
 *
 * Auto-invoked at the end of sync.mjs.
 * Standalone: node scripts/export-viewer.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { join, dirname, basename, relative } from 'path'
import { fileURLToPath } from 'url'
import { load as parseYaml } from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'viewer', 'public', 'data.json')

export function exportViewerData() {
  // ── 1. core rules ──────────────────────────────────────────────
  const coreDir = join(ROOT, 'core')
  const rules = {}

  for (const file of readdirSync(coreDir).filter(f => f.endsWith('.md')).sort()) {
    const id = basename(file, '.md')
    const raw = readFileSync(join(coreDir, file), 'utf-8')
    const { title, subtitle, priority } = parseMdMeta(id, raw)
    rules[id] = { id, title, subtitle, priority, content: raw }
  }

  // ── 2. extensions ──────────────────────────────────────────────
  const extDir = join(ROOT, 'extensions')
  const extensions = {}

  for (const file of readdirSync(extDir).filter(f => f.endsWith('.md')).sort()) {
    const id = basename(file, '.md')
    const raw = readFileSync(join(extDir, file), 'utf-8')
    const { title } = parseMdMeta(id, raw)
    extensions[id] = { id, title, content: raw }
  }

  // ── 3. handbook docs ───────────────────────────────────────────
  const handbook = buildHandbook()

  // ── 4. agents ──────────────────────────────────────────────────
  const agentsDir = join(ROOT, 'agents')
  const agents = {}

  for (const file of readdirSync(agentsDir).filter(f => f.endsWith('.md')).sort()) {
    const id = basename(file, '.md')
    const raw = readFileSync(join(agentsDir, file), 'utf-8')
    const { frontmatter, body } = parseFrontmatter(raw)
    const fm = frontmatter ? parseYaml(frontmatter) : {}
    agents[id] = {
      id,
      name: fm.name ?? id,
      description: fm.description ?? '',
      tools: fm.tools ?? [],
      content: body,
    }
  }

  // ── 5. governance presets ──────────────────────────────────────
  const presetsDir = join(ROOT, 'governance', 'presets')
  const governancePresets = {}

  if (existsSync(presetsDir)) {
    for (const file of readdirSync(presetsDir).filter(f => f.endsWith('.yaml')).sort()) {
      const id = basename(file, '.yaml')
      const raw = readFileSync(join(presetsDir, file), 'utf-8')
      try {
        governancePresets[id] = parseYaml(raw)
      } catch {
        // Skip on parse failure
      }
    }
  }

  // ── 6. profiles (projects) ─────────────────────────────────────
  const profileDir = join(ROOT, 'profiles')
  const projects = []

  for (const file of readdirSync(profileDir)
    .filter(f => f.endsWith('.yaml') && !f.startsWith('_'))
    .sort()
  ) {
    const id = basename(file, '.yaml')
    const profile = parseYaml(readFileSync(join(profileDir, file), 'utf-8'))

    // List of core rules applied to project
    const appliedRules = (profile.core ?? []).map(rid => ({
      id: rid,
      title: rules[rid]?.title ?? rid,
    }))

    // Applied extensions
    const appliedExtensions = (profile.extensions ?? []).map(eid => ({
      id: eid,
      title: extensions[eid]?.title ?? eid,
    }))

    // Agent list
    const agentList = buildAgentList(profile.agents)

    // Overrides summary
    const overrides = profile.overrides
      ? Object.entries(profile.overrides).map(([ruleId, content]) => ({
          ruleId,
          preview: String(content).trim().split('\n').slice(0, 3).join('\n'),
        }))
      : []

    // Governance config
    const governance = profile.governance ?? null

    // Sync status: whether output/ directory exists
    const outputDir = join(ROOT, 'output', id)
    const synced = existsSync(outputDir)

    projects.push({
      id,
      name: profile.name ?? id,
      description: profile.description ?? '',
      targetPath: profile.target_path,
      stack: profile.stack ?? null,
      tools: Object.keys(profile.tools ?? {}).filter(t => profile.tools[t]?.enabled),
      appliedRules,
      appliedExtensions,
      agents: agentList,
      overrides,
      governance,
      synced,
    })
  }

  // ── 7. Roadmap ─────────────────────────────────────
  const roadmap = buildRoadmap()

  // ── 8. Statistics ───────────────────────────────────────────────────
  const stats = {
    projects: projects.length,
    coreRules: Object.keys(rules).length,
    extensions: Object.keys(extensions).length,
    agents: Object.keys(agents).length,
    handbookDocs: handbook.docs.length,
    syncedAt: new Date().toISOString(),
  }

  // ── 9. Output ───────────────────────────────────────────────────
  const data = { stats, rules, extensions, handbook, agents, projects, governancePresets, roadmap }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(data, null, 2), 'utf-8')

  console.log(`  📦 viewer/public/data.json generated (rules: ${stats.coreRules}, projects: ${stats.projects})`)
  return data
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * # Extract title/subtitle from h1 in {id} — {title} format
 */
function parseMdMeta(id, content) {
  const h1 = content.match(/^#\s+(.+)$/m)?.[1] ?? id
  // "00-identity — Persona & Communication" -> title: "Persona & Communication"
  const dashIdx = h1.indexOf(' — ')
  const title = dashIdx > -1 ? h1.slice(dashIdx + 3).trim() : h1.trim()

  // Use first h2 text as subtitle
  const subtitle = content.match(/^##\s+(.+)$/m)?.[1] ?? ''

  // Determine priority by CRITICAL keyword presence
  const priority = /CRITICAL|absolutely forbidden|critical/.test(content) ? 'critical' : 'normal'

  return { title, subtitle, priority }
}

/**
 * Split frontmatter (---...---)
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { frontmatter: '', body: content }
  return { frontmatter: match[1], body: match[2] }
}

/**
 * Extract agent name list from profile.agents config
 */
function buildAgentList(agentsConfig) {
  if (!agentsConfig?.enabled) return []
  return (agentsConfig.include ?? []).map(item => {
    if (typeof item === 'string') return item
    return Object.keys(item)[0]
  })
}

function buildHandbook() {
  const docsDir = join(ROOT, 'docs')
  const docs = []

  if (!existsSync(docsDir)) {
    return { overviewId: null, docs }
  }

  for (const file of walkMarkdownFiles(docsDir)) {
    const relFromDocs = relative(docsDir, file).replace(/\\/g, '/')
    const sourcePath = `docs/${relFromDocs}`
    const id = relFromDocs.replace(/\.md$/i, '')
    const raw = readFileSync(file, 'utf-8')
    const { title, subtitle } = parseMdMeta(id, raw)
    const description = parseDocDescription(raw) ?? subtitle
    const category = relFromDocs.includes('/') ? relFromDocs.split('/')[0] : 'root'
    const date = parseDocDate(raw) ?? null

    docs.push({
      id,
      slug: id,
      title,
      subtitle,
      description,
      category,
      sourcePath,
      date,
      content: raw,
    })
  }

  docs.sort((a, b) => {
    if (a.category === 'root' && b.category !== 'root') return -1
    if (a.category !== 'root' && b.category === 'root') return 1
    if (a.category === 'changes' && b.category === 'changes') {
      return (b.date ?? b.id).localeCompare(a.date ?? a.id)
    }
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.id.localeCompare(b.id)
  })

  const overview = docs.find(doc => doc.id === '00_INDEX') ?? null
  return {
    overviewId: overview?.id ?? null,
    docs,
  }
}

function walkMarkdownFiles(dir) {
  const results = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_')) continue
      results.push(...walkMarkdownFiles(entryPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(entryPath)
    }
  }

  return results
}

function parseDocDate(content) {
  const match = content.match(/^>\s*Written:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/m)
  return match?.[1] ?? null
}

function parseDocDescription(content) {
  const purposeLine = content.match(/^>\s*Purpose:\s*(.+)$/m)?.[1]?.trim()
  if (purposeLine) return purposeLine

  const paragraphs = content
    .replace(/^#\s+.+$/m, '')
    .split(/\r?\n\r?\n/)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .filter(chunk => !chunk.startsWith('> Written:'))
    .filter(chunk => !chunk.startsWith('> Purpose:'))
    .filter(chunk => chunk !== '---')
    .filter(chunk => !chunk.startsWith('## '))

  const firstParagraph = paragraphs.find(chunk => !chunk.startsWith('>'))
  if (!firstParagraph) return ''

  return firstParagraph
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

/**
 * Roadmap data (hardcoded based on AI_RULES_IMPROVEMENT_ANALYSIS.md)
 * Gaps A-F progress by phase
 */
function buildRoadmap() {
  return {
    phases: [
      {
        id: 'phase1',
        title: 'Phase 1 — Immediate',
        description: 'Session start procedures + autonomous execution triggers + bootstrap procedures',
        status: 'completed',
        items: [
          { id: 'gap-c', label: 'New project bootstrap procedure (06-session Step 0)', status: 'completed', file: 'core/06-session.md' },
          { id: 'gap-c2', label: 'Exception conditions when exploration anchors absent (05-responses)', status: 'completed', file: 'core/05-responses.md' },
          { id: 'gap-e', label: 'AI autonomous execution triggers + human approval thresholds (04-workflow)', status: 'completed', file: 'core/04-workflow.md' },
        ],
      },
      {
        id: 'phase2',
        title: 'Phase 2 — Short-term',
        description: 'Governance integration + hooks guide + subagent patterns',
        status: 'completed',
        items: [
          { id: 'gap-a', label: 'Governance cross-verification system integration (ai-governance -> ai-rules)', status: 'completed', file: 'governance/' },
          { id: 'gap-a2', label: 'Provider-agnostic llm-client (verifiers/judge architecture)', status: 'completed', file: 'governance/orchestrator/llm-client.mjs' },
          { id: 'gap-d', label: 'Hooks guide (09-hooks-guide.md)', status: 'completed', file: 'core/09-hooks-guide.md' },
          { id: 'gap-f', label: 'Subagent delegation patterns (10-subagent-patterns.md)', status: 'completed', file: 'core/10-subagent-patterns.md' },
          { id: 'gov-schema', label: 'Governance common policy documentation (BYPASS_POLICY, DEPLOYMENT_CONTRACT, DOMAIN_THRESHOLD_MODEL, PROJECT_CAPABILITY_MATRIX)', status: 'completed', file: 'docs/guide/' },
        ],
      },
      {
        id: 'phase3',
        title: 'Phase 3 — Mid-term',
        description: 'Governance script implementation + domain threshold automation + deployment adapter',
        status: 'in_progress',
        items: [
          { id: 'gap-d2', label: 'agents/ -> .claude/agents/ YAML frontmatter format migration', status: 'completed', file: 'agents/' },
          { id: 'missing1', label: 'gate-health-check.mjs implementation', status: 'pending', file: 'governance/scripts/gate-health-check.mjs' },
          { id: 'missing2', label: 'eval-runner.mjs implementation', status: 'pending', file: 'governance/scripts/eval-runner.mjs' },
          { id: 'missing3', label: 'trust-score.mjs implementation', status: 'pending', file: 'governance/scripts/trust-score.mjs' },
          { id: 'threshold-auto', label: 'DOMAIN_THRESHOLD_MODEL-based thresholds.yaml auto-generation (governance adapter)', status: 'pending', file: 'adapters/governance.mjs' },
          { id: 'bypass-proj', label: 'PROJECT_CAPABILITY_MATRIX per-project status + bypass policy application', status: 'pending', file: 'docs/guide/PROJECT_CAPABILITY_MATRIX.md' },
          { id: 'deploy-adapter', label: 'Deployment adapter pattern implementation (Vercel / Docker-VM built-in support)', status: 'pending', file: 'adapters/deployment.mjs' },
          { id: 'ext-dedup', label: 'extensions/my-saas-app-frontend.md duplicate removal', status: 'pending', file: 'extensions/my-saas-app-frontend.md' },
        ],
      },
      {
        id: 'phase4',
        title: 'Phase 4 — Long-term',
        description: 'CLAUDE.md slimming + AGENTS.md standard + Gemini support + MCP integration',
        status: 'pending',
        items: [
          { id: 'gap-b', label: 'CLAUDE.md slimming to <150 lines + skills system extraction', status: 'pending', file: null },
          { id: 'agents-md', label: 'AGENTS.md standard support (Linux Foundation) + agents-md adapter', status: 'pending', file: null },
          { id: 'gemini', label: 'Google Gemini provider verification and official support', status: 'pending', file: 'governance/orchestrator/llm-client.mjs' },
          { id: 'mcp-linear', label: 'MCP integration — Linear/Jira -> INTENT.md auto-generation', status: 'pending', file: null },
          { id: 'mcp-figma', label: 'MCP integration — Figma -> UI asset auto-discovery', status: 'pending', file: null },
          { id: 'rollback-mgmt', label: 'Rollback readiness management + post-deploy verify level definition', status: 'pending', file: 'docs/guide/DEPLOYMENT_CONTRACT.md' },
        ],
      },
    ],
    gaps: [
      { id: 'A', label: 'Advisory vs. Deterministic', priority: 3, description: 'CLAUDE.md rules are advisory — need hook reinforcement' },
      { id: 'B', label: 'CLAUDE.md bloat risk', priority: 3, description: 'Recommended to keep under 200 lines, extract on-demand via skills system' },
      { id: 'C', label: 'Missing new project entry procedure', priority: 3, description: 'Bootstrap procedure needed when docs/00_INDEX.md is absent' },
      { id: 'D', label: 'Subagent definitions exist only as text', priority: 2, description: 'Migrate to .claude/agents/ official format' },
      { id: 'E', label: 'Human-AI hybrid gate imbalance', priority: 2, description: 'Specify autonomous execution triggers + approval thresholds' },
      { id: 'F', label: 'Insufficient context exhaustion management', priority: 2, description: 'Protect main context via subagent delegation' },
    ],
  }
}

// Standalone execution support
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('export-viewer.mjs')
if (isDirectRun) {
  exportViewerData()
}
