/**
 * pipeline-state.mjs — Pipeline state reader
 *
 * Reads INTENT.md, SESSION.md, FAILURE_LOG.md, and git state to
 * derive the current pipeline state. Uses filesystem only, no separate DB.
 *
 * Zero external dependencies — Node.js built-in modules only.
 */

import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

// ── INTENT.md Analysis ───────────────────────────────────────────────────

const REQUIRED_SECTIONS = ['## Objective', '## Scope', '## Affected Files', '## Verification Method']

const ARCHITECT_KEYWORDS = [/new\s*API.*[2-9]/, /DB\s*change/, /schema\s*change/, /service.*[3-9].*interaction/]
const DESIGNER_KEYWORDS = [/new\s*UI\s*page/, /visual\s*change/, /component\s*add/, /design\s*change/]
const SECURITY_KEYWORDS = [/auth/, /payment/, /security/, /JWT/, /OAuth/, /permission/, /payment/i, /auth/i]

function analyzeIntent(projectRoot) {
  const intentPath = join(projectRoot, 'INTENT.md')
  if (!existsSync(intentPath)) {
    return { exists: false, path: null, complete: false, urgent: false, needsArchitect: false, needsDesigner: false, needsSecurity: false }
  }

  const content = readFileSync(intentPath, 'utf-8')
  const presentSections = REQUIRED_SECTIONS.filter(s => content.includes(s))
  const complete = presentSections.length === REQUIRED_SECTIONS.length
  const urgent = content.includes('[URGENT]')

  const needsArchitect = ARCHITECT_KEYWORDS.some(kw => kw.test(content))
  const needsDesigner = DESIGNER_KEYWORDS.some(kw => kw.test(content))
  const needsSecurity = SECURITY_KEYWORDS.some(kw => kw.test(content))

  return { exists: true, path: intentPath, complete, urgent, needsArchitect, needsDesigner, needsSecurity }
}

// ── DESIGN.md Check ──────────────────────────────────────────────────

function analyzeDesign(projectRoot, intent) {
  const designDir = join(projectRoot, 'docs', 'design')
  let exists = false

  if (existsSync(designDir)) {
    try {
      const dirs = readdirSync(designDir, { withFileTypes: true }).filter(d => d.isDirectory())
      exists = dirs.some(d => existsSync(join(designDir, d.name, 'DESIGN.md')))
    } catch { /* empty design dir */ }
  }

  const required = intent.exists && (intent.needsArchitect || intent.needsSecurity)

  return { exists, required }
}

// ── SESSION.md HANDOFF Parsing ─────────────────────────────────────────

function parseSession(projectRoot) {
  const sessionPath = join(projectRoot, 'SESSION.md')
  if (!existsSync(sessionPath)) {
    return { exists: false, lastHandoff: null }
  }

  const content = readFileSync(sessionPath, 'utf-8')
  const handoffMatch = content.match(/---HANDOFF---\r?\n([\s\S]*?)---END---/)
  if (!handoffMatch) {
    return { exists: true, lastHandoff: null }
  }

  const block = handoffMatch[1]
  const get = (key) => {
    const m = block.match(new RegExp(`^${key}:\\s*(.+)`, 'm'))
    return m ? m[1].trim() : null
  }

  return {
    exists: true,
    lastHandoff: {
      date: get('date'),
      branch: get('branch'),
      status: get('status'),
      firstAction: get('first_action'),
    },
  }
}

// ── FAILURE_LOG.md Analysis ─────────────────────────────────────────────

function analyzeFailures(projectRoot) {
  const failurePath = join(projectRoot, 'FAILURE_LOG.md')
  if (!existsSync(failurePath)) {
    return { count: 0, diagnoseMode: false }
  }

  const content = readFileSync(failurePath, 'utf-8')
  const openPatterns = (content.match(/🔴\s*Open/g) || []).length
  // diagnoseMode: if 2+ identical Open patterns exist
  const diagnoseMode = openPatterns >= 2

  return { count: openPatterns, diagnoseMode }
}

// ── Git State ────────────────────────────────────────────────────────

function readGitState(projectRoot) {
  const defaults = { branch: 'unknown', dirty: false, lastCommit: 'none' }

  try {
    const branch = execSync('git branch --show-current', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }).trim()
    const status = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }).trim()
    const lastCommit = execSync('git log -1 --format=%H', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }).trim()

    return { branch: branch || 'HEAD', dirty: status.length > 0, lastCommit: lastCommit || 'none' }
  } catch {
    return defaults
  }
}

// ── Stage Determination ──────────────────────────────────────────────────────

function determineStage(intent, design, git) {
  if (!intent.exists) return 'idle'
  if (!intent.complete) return 'planning'
  if (design.required && !design.exists) return 'planning'
  if (git.dirty) return 'building'
  // Has commits and intent complete -> may be in reviewing stage
  if (intent.complete && !git.dirty && git.lastCommit !== 'none') return 'reviewing'
  return 'building'
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * @param {string} projectRoot
 * @returns {PipelineState}
 */
export function readState(projectRoot) {
  const intent = analyzeIntent(projectRoot)
  const design = analyzeDesign(projectRoot, intent)
  const session = parseSession(projectRoot)
  const failures = analyzeFailures(projectRoot)
  const git = readGitState(projectRoot)
  const stage = determineStage(intent, design, git)

  return { stage, intent, design, session, failures, git }
}
