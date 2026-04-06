/**
 * pipeline-dispatcher.mjs — NEXT_AGENT parsing + routing
 *
 * Parses the NEXT_AGENT block from agent output and
 * determines the next agent based on pipeline state + rules.
 *
 * Zero external dependencies — Node.js built-in modules only.
 */

// ── NEXT_AGENT Parsing ─────────────────────────────────────────────────

const VALID_AGENTS = ['planner', 'architect', 'designer', 'builder', 'qa', 'reviewer', 'security', 'investigator']

/**
 * Parses the ## NEXT_AGENT block from agent output.
 *
 * @param {string} agentOutput — Full agent output text
 * @returns {{ agent: string, reason: string, input: string } | null}
 */
export function parseNextAgent(agentOutput) {
  if (!agentOutput) return null

  // Find ## NEXT_AGENT section
  const sectionMatch = agentOutput.match(/##\s*NEXT_AGENT\s*\n([\s\S]*?)(?=\n##\s|\n---\s|$)/)
  if (!sectionMatch) return null

  const block = sectionMatch[1]

  const agentMatch = block.match(/\*\*Next Agent\*\*:\s*(.+)/i)
  const reasonMatch = block.match(/\*\*Reason\*\*:\s*(.+)/i)
  const inputMatch = block.match(/\*\*Input\*\*:\s*(.+)/i)

  if (!agentMatch) return null

  const agentName = agentMatch[1].trim().toLowerCase()

  // "none" or empty value
  if (agentName === 'none' || agentName === '') return null

  // Check if valid agent name
  if (!VALID_AGENTS.includes(agentName)) return null

  return {
    agent: agentName,
    reason: reasonMatch ? reasonMatch[1].trim() : '',
    input: inputMatch ? inputMatch[1].trim() : '',
  }
}

// ── Result Type Parsing (REVIEW_RESULT, BUILD_RESULT, etc.) ─────────────────

/**
 * Parses structured result blocks from agent output.
 */
export function parseAgentResult(agentOutput) {
  if (!agentOutput) return null

  // REVIEW_RESULT
  const reviewMatch = agentOutput.match(/##\s*REVIEW_RESULT[\s\S]*?\*\*Verdict\*\*:\s*(APPROVE|REQUEST_CHANGES|COMMENT)/i)
  if (reviewMatch) {
    return { type: 'review', verdict: reviewMatch[1].toUpperCase() }
  }

  // SECURITY_RESULT
  const securityMatch = agentOutput.match(/##\s*SECURITY_RESULT[\s\S]*?\*\*Verdict\*\*:\s*(PASS|FAIL|WARN)/i)
  if (securityMatch) {
    return { type: 'security', verdict: securityMatch[1].toUpperCase() }
  }

  // BUILD_RESULT
  const buildMatch = agentOutput.match(/##\s*BUILD_RESULT[\s\S]*?\*\*Status\*\*:\s*(DONE|BLOCKED|DIAGNOSE)/i)
  if (buildMatch) {
    return { type: 'build', status: buildMatch[1].toUpperCase() }
  }

  // QA_RESULT
  const qaMatch = agentOutput.match(/##\s*QA_RESULT[\s\S]*?\*\*Status\*\*:\s*(PASS|FAIL|PARTIAL)/i)
  if (qaMatch) {
    return { type: 'qa', status: qaMatch[1].toUpperCase() }
  }

  return null
}

// ── Routing Decision ─────────────────────────────────────────────────────

// Cycle prevention: max reviewer<->builder iteration count
const MAX_REVIEW_CYCLES = 3

/**
 * Determines next action based on pipeline state + agent output.
 *
 * @param {PipelineState} state
 * @param {string} [agentOutput] — Previous agent output
 * @param {object} [options]
 * @param {number} [options.reviewCycles] — Current reviewer<->builder iteration count
 * @returns {NextAction}
 */
export function resolveNext(state, agentOutput, options = {}) {
  const { reviewCycles = 0 } = options

  // ── DIAGNOSE MODE / Consecutive Failures ────────────────────────────────────
  if (state.failures.count >= 3) {
    return { action: 'stop', agent: null, gate: null, reason: '3 consecutive failures — STOP + rollback + report to user' }
  }
  if (state.failures.diagnoseMode) {
    return { action: 'invoke', agent: 'investigator', gate: null, reason: 'Same error 2 times — investigator diagnosis' }
  }

  // ── Cycle Prevention ────────────────────────────────────────────────────
  if (reviewCycles >= MAX_REVIEW_CYCLES) {
    return { action: 'stop', agent: null, gate: null, reason: `reviewer<->builder ${MAX_REVIEW_CYCLES} iterations — user intervention required` }
  }

  // ── When NEXT_AGENT is specified (planner, architect, security, etc.) ──
  const directive = parseNextAgent(agentOutput)
  if (directive) {
    // Gate determination: which gate must be passed
    const gate = resolveGateForAgent(directive.agent, state)
    return { action: 'invoke', agent: directive.agent, gate, reason: directive.reason }
  }

  // ── Result-based Routing (agents without NEXT_AGENT) ──────────
  const result = parseAgentResult(agentOutput)
  if (result) {
    return routeByResult(result, state)
  }

  // ── No agent output -> stage-based initial routing ──────────────────
  return routeByStage(state)
}

// ── Internal Routing Functions ────────────────────────────────────────────────

function routeByStage(state) {
  switch (state.stage) {
    case 'idle':
      return { action: 'invoke', agent: 'planner', gate: null, reason: 'Starting work — invoke planner' }

    case 'planning':
      if (state.intent.needsArchitect) {
        return { action: 'invoke', agent: 'architect', gate: 'G1', reason: 'Architect needed (API/DB/service)' }
      }
      if (state.intent.needsDesigner) {
        return { action: 'invoke', agent: 'designer', gate: 'G1', reason: 'Designer needed (UI changes)' }
      }
      return { action: 'invoke', agent: 'builder', gate: 'G1', reason: 'Proceed directly to builder' }

    case 'building':
      if (state.git.dirty) {
        return { action: 'invoke', agent: 'builder', gate: 'G2', reason: 'Continue building (uncommitted changes exist)' }
      }
      if (state.intent.needsSecurity) {
        return { action: 'invoke', agent: 'security', gate: 'G3', reason: 'Security-related changes — security first' }
      }
      return { action: 'invoke', agent: 'reviewer', gate: 'G3', reason: 'Build complete — invoke reviewer' }

    case 'reviewing':
      return { action: 'invoke', agent: 'reviewer', gate: 'G3', reason: 'Review stage' }

    default:
      return { action: 'invoke', agent: 'planner', gate: null, reason: 'Unknown state — start with planner' }
  }
}

function routeByResult(result, state) {
  switch (result.type) {
    case 'build':
      if (result.status === 'DIAGNOSE') {
        return { action: 'invoke', agent: 'investigator', gate: null, reason: 'builder DIAGNOSE — invoke investigator' }
      }
      if (result.status === 'BLOCKED') {
        return { action: 'stop', agent: null, gate: null, reason: 'builder BLOCKED — user intervention required' }
      }
      // DONE → security or reviewer
      if (state.intent.needsSecurity) {
        return { action: 'invoke', agent: 'security', gate: 'G3', reason: 'Build complete + security-related -> security' }
      }
      return { action: 'invoke', agent: 'reviewer', gate: 'G3', reason: 'Build complete -> reviewer' }

    case 'review':
      if (result.verdict === 'APPROVE') {
        return { action: 'complete', agent: null, gate: 'G4', reason: 'reviewer APPROVE — PR can be created' }
      }
      return { action: 'invoke', agent: 'builder', gate: null, reason: `reviewer ${result.verdict} — builder fix` }

    case 'security':
      if (result.verdict === 'FAIL') {
        return { action: 'invoke', agent: 'builder', gate: null, reason: 'security FAIL — builder fix' }
      }
      return { action: 'invoke', agent: 'reviewer', gate: null, reason: `security ${result.verdict} — proceed to reviewer` }

    case 'qa':
      if (result.status === 'FAIL' || result.status === 'PARTIAL') {
        return { action: 'invoke', agent: 'builder', gate: null, reason: `qa ${result.status} — builder fix` }
      }
      return { action: 'invoke', agent: 'reviewer', gate: 'G3', reason: 'qa PASS — proceed to reviewer' }

    default:
      return { action: 'invoke', agent: 'planner', gate: null, reason: 'Unknown result — return to planner' }
  }
}

function resolveGateForAgent(agent, state) {
  switch (agent) {
    case 'architect':
    case 'designer':
      return 'G1'
    case 'builder':
      return state.design.required ? 'G2' : 'G1'
    case 'reviewer':
    case 'security':
      return 'G3'
    default:
      return null
  }
}
