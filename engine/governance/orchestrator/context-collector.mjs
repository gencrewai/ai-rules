/**
 * Context Collector — Project context loading module
 *
 * Injects project rules, coding standards, and architecture info to cross-verification agents
 * to reduce false positives and enable project-context-aware analysis.
 *
 * Level:
 *   none     — No context (existing behavior)
 *   minimal  — CLAUDE.md key rules only
 *   standard — Rules + coding standards + agent-specific (default)
 *   full     — Everything + INTENT.md, FIXME.md etc.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { resolve, join, basename, extname } from 'path'

/** Default max context chars per agent */
const DEFAULT_MAX_CHARS = 4000

/** Priority section keywords to extract from CLAUDE.md */
const PRIORITY_SECTIONS = [
  'Hard Bans',
  'hard bans',
  'Architecture',
  'architecture',
  'architecture',
  'Security',
  'security',
  'security',
  'DB',
  'Database',
  'validation',
  'Validation',
]

/**
 * Tier-based file definitions
 * - path: Relative path from project root
 * - label: Section label
 * - maxChars: Max chars to extract from this file
 * - fallback: If true, used only when same-name label from higher tier is absent
 * - smart: If true, extract only key rules via extractKeyRules()
 */
const FILE_TIERS = {
  minimal: [
    { path: 'CLAUDE.md', label: 'Project Rules', maxChars: 800, smart: true },
  ],

  standard: [
    { path: 'CLAUDE.md', label: 'Project Rules', maxChars: 1200, smart: true },
    { path: '.ai-governance/agents.yaml', label: 'Agent Definitions', maxChars: 400 },
    { path: 'docs/guide/CODING_STANDARDS.md', label: 'Coding Standards', maxChars: 800 },
    { path: 'CODING_STANDARDS.md', label: 'Coding Standards', maxChars: 800, fallback: true },
    { path: 'docs/guide/DO_NOT_CHANGE.md', label: 'Do Not Change', maxChars: 400 },
    { path: 'DO_NOT_CHANGE.md', label: 'Do Not Change', maxChars: 400, fallback: true },
  ],

  full: [
    { path: 'INTENT.md', label: 'Current Intent', maxChars: 400 },
    { path: 'docs/backlog/FIXME.md', label: 'Known Issues', maxChars: 600 },
    { path: 'FIXME.md', label: 'Known Issues', maxChars: 600, fallback: true },
    { path: 'docs/design/DESIGN_TOKENS.md', label: 'Design Tokens', maxChars: 400 },
  ],
}

/** Agent-specific files (applied at standard level and above) */
const AGENT_SPECIFIC_FILES = {
  structure: [
    { path: 'docs/00_INDEX.md', label: 'Architecture Index', maxChars: 600 },
    { path: 'docs/backend/00_INDEX.md', label: 'Backend Architecture', maxChars: 400 },
  ],
  convention: [
    { path: '.editorconfig', label: 'Editor Config', maxChars: 200 },
    { path: 'tsconfig.json', label: 'TypeScript Config', maxChars: 300 },
  ],
  domain: [
    { path: 'backend/CLAUDE.md', label: 'Backend Rules', maxChars: 400 },
    { path: 'src/CLAUDE.md', label: 'Frontend Rules', maxChars: 400 },
  ],
}

/**
 * Loads project context.
 *
 * @param {string} projectRoot - Target project root path
 * @param {object} [options]
 * @param {'none'|'minimal'|'standard'|'full'} [options.level='standard']
 * @param {string} [options.agentId] - Agent ID (for specialized file loading)
 * @param {string[]} [options.extraFiles] - Additional files to load
 * @param {number} [options.maxCharsPerAgent] - Max chars per agent
 * @param {Map} [options._fileCache] - File read cache (shared by 3 agents)
 * @returns {ProjectContext}
 */
export function loadProjectContext(projectRoot, options = {}) {
  const {
    level = 'standard',
    agentId,
    extraFiles = [],
    maxCharsPerAgent = DEFAULT_MAX_CHARS,
    _fileCache = new Map(),
  } = options

  if (level === 'none') {
    return { sections: [], totalChars: 0, tokenEstimate: 0, level: 'none' }
  }

  const sections = []
  const loadedLabels = new Set()

  // Collect files by tier
  const fileDefs = collectFileDefs(level, agentId)

  // Add extra_files
  for (const extra of extraFiles) {
    fileDefs.push({ path: extra, label: basename(extra), maxChars: 400 })
  }

  // Load files
  for (const def of fileDefs) {
    // Fallback handling: skip if same label already loaded
    if (def.fallback && loadedLabels.has(def.label)) continue

    const fullPath = resolve(projectRoot, def.path)
    const content = readCached(fullPath, _fileCache)
    if (!content) continue

    let extracted
    if (def.smart) {
      extracted = extractKeyRules(content, def.maxChars)
    } else {
      extracted = truncateToLines(content, def.maxChars)
    }

    if (extracted.length < 50) continue // Too short to be meaningful

    sections.push({
      label: def.label,
      content: extracted,
      source: def.path,
      chars: extracted.length,
    })
    loadedLabels.add(def.label)
  }

  // Fit within budget
  const fitted = fitWithinBudget(sections, maxCharsPerAgent)

  const totalChars = fitted.reduce((sum, s) => sum + s.chars, 0)
  return {
    sections: fitted,
    totalChars,
    tokenEstimate: Math.ceil(totalChars / 4),
    level,
  }
}

/**
 * Formats context as a string for user message insertion.
 *
 * @param {ProjectContext} context
 * @returns {string}
 */
export function formatContextForMessage(context) {
  if (!context || context.sections.length === 0) return ''

  const parts = [
    '## Project Context',
    'Below are the rules and standards for this project. Refer to these during analysis.',
    '',
  ]

  for (const section of context.sections) {
    parts.push(`### ${section.label}`)
    parts.push(section.content)
    parts.push('')
  }

  return parts.join('\n')
}

/**
 * Generates concise context summary for leader/judge.
 * Includes only hard bans and key architecture rules.
 *
 * @param {ProjectContext} context
 * @returns {string}
 */
export function formatContextSummaryForLeader(context) {
  if (!context || context.sections.length === 0) return ''

  // Extract only Project Rules and Coding Standards sections
  const relevant = context.sections.filter(s =>
    s.label === 'Project Rules' || s.label === 'Coding Standards'
  )

  if (relevant.length === 0) return ''

  const parts = []
  for (const section of relevant) {
    // Abbreviate to bullet points
    const lines = section.content.split('\n')
      .filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'))
      .slice(0, 15) // Max 15 bullets

    if (lines.length > 0) {
      parts.push(`### ${section.label}`)
      parts.push(lines.join('\n'))
      parts.push('')
    }
  }

  return parts.join('\n')
}

// ── Internal Functions ──────────────────────────────────────────────────────

/**
 * Collects file definitions to load based on level and agentId.
 */
function collectFileDefs(level, agentId) {
  const defs = []

  // minimal is always included
  defs.push(...FILE_TIERS.minimal)

  if (level === 'standard' || level === 'full') {
    defs.push(...FILE_TIERS.standard)

    // Agent-specific files
    if (agentId && AGENT_SPECIFIC_FILES[agentId]) {
      defs.push(...AGENT_SPECIFIC_FILES[agentId])
    }
  }

  if (level === 'full') {
    defs.push(...FILE_TIERS.full)
  }

  return defs
}

/**
 * Reads file and caches it.
 *
 * @param {string} fullPath - Absolute path
 * @param {Map} cache - File cache
 * @returns {string|null}
 */
function readCached(fullPath, cache) {
  if (cache.has(fullPath)) return cache.get(fullPath)

  try {
    if (!existsSync(fullPath)) {
      cache.set(fullPath, null)
      return null
    }
    const content = readFileSync(fullPath, 'utf-8')
    cache.set(fullPath, content)
    return content
  } catch {
    cache.set(fullPath, null)
    return null
  }
}

/**
 * Extracts key rule sections from CLAUDE.md.
 *
 * @param {string} content - Full CLAUDE.md content
 * @param {number} maxChars - Max character count
 * @returns {string}
 */
function extractKeyRules(content, maxChars) {
  // Split by ## headers
  const sections = splitBySections(content)

  if (sections.length === 0) {
    return truncateToLines(content, maxChars)
  }

  // Collect in priority keyword matching order
  const prioritized = []
  const remaining = []

  for (const section of sections) {
    const isPriority = PRIORITY_SECTIONS.some(kw =>
      section.heading.toLowerCase().includes(kw.toLowerCase())
    )
    if (isPriority) {
      prioritized.push(section)
    } else {
      remaining.push(section)
    }
  }

  // Combine: priority sections first, then remainder
  const ordered = [...prioritized, ...remaining]
  let result = ''
  let sectionCount = 0

  for (const section of ordered) {
    const candidate = result + (result ? '\n\n' : '') + `## ${section.heading}\n${section.body}`
    if (candidate.length > maxChars && result.length > 0) {
      break
    }
    result = candidate
    sectionCount++
  }

  // Show remaining section count
  const skipped = sections.length - sectionCount
  if (skipped > 0) {
    result += `\n\n[... ${skipped} sections omitted]`
  }

  return result.slice(0, maxChars)
}

/**
 * Splits markdown content by ## headers into sections.
 *
 * @param {string} content
 * @returns {{ heading: string, body: string }[]}
 */
function splitBySections(content) {
  const lines = content.split('\n')
  const sections = []
  let currentHeading = null
  let currentBody = []

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)/)
    if (match) {
      if (currentHeading !== null) {
        sections.push({
          heading: currentHeading,
          body: currentBody.join('\n').trim(),
        })
      }
      currentHeading = match[1]
      currentBody = []
    } else if (currentHeading !== null) {
      currentBody.push(line)
    }
  }

  // Last section
  if (currentHeading !== null) {
    sections.push({
      heading: currentHeading,
      body: currentBody.join('\n').trim(),
    })
  }

  return sections
}

/**
 * Truncates text to maxChars at line boundaries.
 *
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
function truncateToLines(text, maxChars) {
  if (text.length <= maxChars) return text

  const truncated = text.slice(0, maxChars)
  const lastNewline = truncated.lastIndexOf('\n')
  const clean = lastNewline > 0 ? truncated.slice(0, lastNewline) : truncated

  return clean + '\n[TRUNCATED]'
}

/**
 * Adjusts per-section allocation within total budget.
 *
 * @param {ContextSection[]} sections
 * @param {number} maxTotal
 * @returns {ContextSection[]}
 */
function fitWithinBudget(sections, maxTotal) {
  const total = sections.reduce((sum, s) => sum + s.chars, 0)
  if (total <= maxTotal) return sections

  // Proportional reduction
  const ratio = maxTotal / total
  const result = []

  for (const section of sections) {
    const newMaxChars = Math.max(Math.floor(section.chars * ratio), 100)
    if (newMaxChars < 100) continue // Remove if under 100 chars

    result.push({
      ...section,
      content: truncateToLines(section.content, newMaxChars),
      chars: Math.min(section.chars, newMaxChars),
    })
  }

  return result
}
