/**
 * pipeline-gates.mjs — G1-G4 gate verification
 *
 * Verifies each gate programmatically.
 * G3 detects project toolchain and runs appropriate validation.
 *
 * Zero external dependencies — Node.js built-in modules only.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

// ── Individual Checks ───────────────────────────────────────────────────────

function check(name, passed, detail) {
  return { name, passed, ...(detail ? { detail } : {}) }
}

// ── G1: Plan -> Design ──────────────────────────────────────────────────

function checkG1(state) {
  const checks = []

  checks.push(check('INTENT.md exists', state.intent.exists))

  if (state.intent.exists) {
    const intentPath = state.intent.path
    const content = readFileSync(intentPath, 'utf-8')

    const sections = ['## Objective', '## Scope', '## Affected Files', '## Verification Method']
    const missing = sections.filter(s => !content.includes(s))
    checks.push(check(
      'INTENT.md required sections complete',
      missing.length === 0,
      missing.length > 0 ? `Missing: ${missing.join(', ')}` : undefined,
    ))

    // Check for approval marks — [Approved], [APPROVED], or checked checkboxes
    const hasApproval = /\[Approved\]|\[APPROVED\]|\[x\]\s*(approved)/i.test(content)
    checks.push(check('User approval mark', hasApproval))
  }

  const passed = checks.every(c => c.passed)
  return {
    gate: 'G1',
    passed,
    skippable: true, // Can skip in urgent cases
    checks,
    reason: passed ? 'G1 passed' : `G1 failed: ${checks.filter(c => !c.passed).map(c => c.name).join(', ')}`,
  }
}

// ── G2: Design -> Build ──────────────────────────────────────────────────

function checkG2(state, projectRoot) {
  const checks = []

  if (state.design.required) {
    checks.push(check('DESIGN.md exists (required)', state.design.exists))
  } else {
    checks.push(check('DESIGN.md not required', true))
  }

  // Drift check: verify affected file paths from INTENT.md actually exist
  if (state.intent.exists && state.intent.path) {
    const content = readFileSync(state.intent.path, 'utf-8')
    const affectedSection = content.match(/## Affected Files\s*\n([\s\S]*?)(?=\n##|$)/)
    if (affectedSection) {
      const fileLines = affectedSection[1].match(/^-\s+`?([^`:\s]+)/gm) || []
      const paths = fileLines.map(l => l.replace(/^-\s+`?/, '').replace(/`.*$/, '').trim())
      const missing = paths.filter(p => p && !existsSync(join(projectRoot, p)))
      checks.push(check(
        'Drift check (affected files exist)',
        missing.length === 0,
        missing.length > 0 ? `Not found: ${missing.slice(0, 5).join(', ')}` : undefined,
      ))
    }
  }

  const passed = checks.every(c => c.passed)
  return {
    gate: 'G2',
    passed,
    skippable: true,
    checks,
    reason: passed ? 'G2 passed' : `G2 failed: ${checks.filter(c => !c.passed).map(c => c.name).join(', ')}`,
  }
}

// ── G3: Build -> Review (cannot skip) ────────────────────────────────

function checkG3(state, projectRoot) {
  const checks = []

  // 1. Detect project toolchain + run validation
  const validations = detectAndRunValidation(projectRoot)
  checks.push(...validations)

  // 2. Check commit status
  checks.push(check('Commit complete (clean working tree)', !state.git.dirty))

  const passed = checks.every(c => c.passed)
  return {
    gate: 'G3',
    passed,
    skippable: false, // Cannot be skipped
    checks,
    reason: passed ? 'G3 passed' : `G3 failed: ${checks.filter(c => !c.passed).map(c => c.name).join(', ')}`,
  }
}

function detectAndRunValidation(projectRoot) {
  const checks = []

  // ai-rules own repo: scripts/validate.mjs
  if (existsSync(join(projectRoot, 'scripts', 'validate.mjs'))) {
    try {
      execSync('node scripts/validate.mjs', { cwd: projectRoot, encoding: 'utf-8', timeout: 30000, stdio: 'pipe' })
      checks.push(check('validate.mjs passed', true))
    } catch (e) {
      checks.push(check('validate.mjs passed', false, e.stdout?.slice(0, 200) || e.message))
    }
    return checks
  }

  // TypeScript project
  if (existsSync(join(projectRoot, 'tsconfig.json'))) {
    try {
      execSync('npx tsc --noEmit', { cwd: projectRoot, encoding: 'utf-8', timeout: 60000, stdio: 'pipe' })
      checks.push(check('tsc --noEmit passed', true))
    } catch (e) {
      checks.push(check('tsc --noEmit passed', false, e.stdout?.slice(0, 200) || e.message))
    }
  }

  // Python project (ruff)
  if (existsSync(join(projectRoot, 'pyproject.toml'))) {
    const pyproject = readFileSync(join(projectRoot, 'pyproject.toml'), 'utf-8')
    if (pyproject.includes('ruff')) {
      try {
        execSync('ruff check .', { cwd: projectRoot, encoding: 'utf-8', timeout: 30000, stdio: 'pipe' })
        checks.push(check('ruff check passed', true))
      } catch (e) {
        checks.push(check('ruff check passed', false, e.stdout?.slice(0, 200) || e.message))
      }
    }
  }

  // ESLint
  const eslintConfigs = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs']
  if (eslintConfigs.some(f => existsSync(join(projectRoot, f)))) {
    try {
      execSync('npx eslint .', { cwd: projectRoot, encoding: 'utf-8', timeout: 60000, stdio: 'pipe' })
      checks.push(check('eslint passed', true))
    } catch (e) {
      checks.push(check('eslint passed', false, e.stdout?.slice(0, 200) || e.message))
    }
  }

  // No toolchain detected — do not block
  if (checks.length === 0) {
    checks.push(check('Static validation (no toolchain detected — skipped)', true))
  }

  return checks
}

// ── G4: Review -> Deploy ──────────────────────────────────────────────────

function checkG4(state, agentOutput) {
  const checks = []

  if (!agentOutput) {
    checks.push(check('Review/security audit result exists', false, 'agentOutput missing'))
    return { gate: 'G4', passed: false, skippable: false, checks, reason: 'G4 failed: no review result' }
  }

  // Parse reviewer result
  const reviewMatch = agentOutput.match(/##\s*REVIEW_RESULT[\s\S]*?\*\*Verdict\*\*:\s*(APPROVE|REQUEST_CHANGES|COMMENT)/i)
  if (reviewMatch) {
    const verdict = reviewMatch[1].toUpperCase()
    checks.push(check('Reviewer verdict', verdict === 'APPROVE', verdict !== 'APPROVE' ? `Verdict: ${verdict}` : undefined))
  }

  // CRITICAL count
  const criticalMatch = agentOutput.match(/\*\*CRITICAL\*\*:\s*(\d+)/i)
  if (criticalMatch) {
    const count = parseInt(criticalMatch[1], 10)
    checks.push(check('CRITICAL findings: 0', count === 0, count > 0 ? `${count} found` : undefined))
  }

  // Parse security result
  const securityMatch = agentOutput.match(/##\s*SECURITY_RESULT[\s\S]*?\*\*Verdict\*\*:\s*(PASS|FAIL|WARN)/i)
  if (securityMatch) {
    const verdict = securityMatch[1].toUpperCase()
    checks.push(check('Security verdict', verdict !== 'FAIL', verdict === 'FAIL' ? 'Security audit FAIL' : undefined))
  }

  // If no results could be parsed
  if (checks.length === 0) {
    checks.push(check('Structured result parsing', false, 'No ## REVIEW_RESULT or ## SECURITY_RESULT block found'))
  }

  const passed = checks.every(c => c.passed)
  return {
    gate: 'G4',
    passed,
    skippable: false,
    checks,
    reason: passed ? 'G4 passed — PR can be created' : `G4 failed: ${checks.filter(c => !c.passed).map(c => c.name).join(', ')}`,
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * @param {'G1'|'G2'|'G3'|'G4'} gateId
 * @param {PipelineState} state
 * @param {object} [options]
 * @param {string} [options.projectRoot]
 * @param {string} [options.agentOutput] — reviewer/security output for G4
 * @returns {GateResult}
 */
export function checkGate(gateId, state, options = {}) {
  const { projectRoot = '.', agentOutput } = options

  switch (gateId) {
    case 'G1': return checkG1(state)
    case 'G2': return checkG2(state, projectRoot)
    case 'G3': return checkG3(state, projectRoot)
    case 'G4': return checkG4(state, agentOutput)
    default: return { gate: gateId, passed: false, skippable: false, checks: [], reason: `Unknown gate: ${gateId}` }
  }
}

/**
 * @param {PipelineState} state
 * @param {object} [options]
 * @returns {GateResult[]}
 */
export function checkAllGates(state, options = {}) {
  return ['G1', 'G2', 'G3', 'G4'].map(g => checkGate(g, state, options))
}
