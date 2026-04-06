/**
 * Deadlock Handler — Agent consensus failure detection and handling
 *
 * Deadlock conditions:
 *   - 2+ agents maintain opposing positions on the same area
 *   - Confidence score spread ≥ 20pp
 *
 * Handling:
 *   - Leader gives clear verdict → auto_resolve
 *   - Leader uncertain (confidence < 60) -> escalate (human review required)
 */

const DEADLOCK_SPREAD_THRESHOLD = 20 // 20pp
const LEADER_CERTAINTY_THRESHOLD = 60 // Leader uncertain if confidence below 60

/**
 * Detects deadlocks.
 *
 * @param {object[]} round1 - Round 1 agent results array
 * @param {object[]|null} round2 - Round 2 cross-check results array
 * @param {object|null} round3 - Round 3 leader verdict result
 * @returns {Deadlock[]}
 */
export function detectDeadlocks(round1, round2, round3) {
  if (!round2) return [] // No Round 2 means no cross-verification at all

  const deadlocks = []

  // Collect findings with disagreements from Round 2
  const disputedFindings = collectDisputedFindings(round1, round2)

  // Group by area (file)
  const areaGroups = groupByArea(disputedFindings)

  for (const [area, findings] of Object.entries(areaGroups)) {
    // Check if 2+ agents are opposing
    const opposingAgents = countOpposingAgents(findings, round2)

    if (opposingAgents < 2) continue

    // Calculate confidence spread
    const spread = calcConfidenceSpread(findings)

    if (spread < DEADLOCK_SPREAD_THRESHOLD) continue

    // Check leader resolution
    const leaderResolved = checkLeaderResolution(area, findings, round3)

    const deadlock = {
      area,
      findingIds: findings.map(f => f.id),
      agentPositions: buildPositionMap(findings, round2),
      confidenceSpread: spread,
      resolution: leaderResolved ? 'auto_resolve' : 'escalate',
    }

    if (!leaderResolved) {
      deadlock.escalationReason =
        `Agent disagreement on ${area} area (spread: ${spread}pp)`
      deadlock.tempZoneUpgrade = '🔴 No-AI Zone (temporary)'
    }

    deadlocks.push(deadlock)
  }

  return deadlocks
}

/**
 * Processes deadlock list and generates summary report.
 *
 * @param {Deadlock[]} deadlocks
 * @param {object} confidence - ConfidenceResult
 * @returns {DeadlockReport}
 */
export function handleDeadlocks(deadlocks, confidence) {
  const escalated = deadlocks.filter(d => d.resolution === 'escalate')
  const autoResolved = deadlocks.filter(d => d.resolution === 'auto_resolve')

  return {
    total: deadlocks.length,
    escalated: escalated.length,
    autoResolved: autoResolved.length,
    requiresHumanReview: escalated.length > 0,
    summary: buildDeadlockSummary(deadlocks, confidence),
  }
}

// ── Internal Functions ────────────────────────────────────────────────────────

/**
 * Collects disputed findings from Round 2.
 */
function collectDisputedFindings(round1, round2) {
  const disputed = new Map()

  // Collect all disagreement findingIds
  const disagreedIds = new Set()
  for (const agent of round2) {
    for (const d of agent.disagreements ?? []) {
      disagreedIds.add(d.findingId)
    }
  }

  // Find corresponding findings in Round 1
  for (const agent of round1) {
    for (const f of agent.findings ?? []) {
      if (disagreedIds.has(f.id)) {
        disputed.set(f.id, { ...f, sourceAgent: agent.agentId })
      }
    }
  }

  return [...disputed.values()]
}

/**
 * Groups findings by file (area).
 */
function groupByArea(findings) {
  const groups = {}
  for (const f of findings) {
    const area = f.file ?? 'unknown'
    if (!groups[area]) groups[area] = []
    groups[area].push(f)
  }
  return groups
}

/**
 * Counts opposing agents.
 */
function countOpposingAgents(findings, round2) {
  const agents = new Set()

  // Agent that created the finding
  for (const f of findings) {
    agents.add(f.sourceAgent)
  }

  // Agent that raised disagreement
  for (const agent of round2) {
    for (const d of agent.disagreements ?? []) {
      if (findings.some(f => f.id === d.findingId)) {
        agents.add(agent.agentId)
      }
    }
  }

  return agents.size
}

/**
 * Calculates confidence spread of findings.
 */
function calcConfidenceSpread(findings) {
  const scores = findings
    .map(f => f.confidence ?? 70)
    .filter(s => s != null)

  if (scores.length < 2) return 0

  const max = Math.max(...scores)
  const min = Math.min(...scores)

  return max - min
}

/**
 * Checks if leader resolved the deadlock for this area.
 */
function checkLeaderResolution(area, findings, round3) {
  if (!round3?.findings) return false

  // Whether leader gave a clear verdict on this finding
  for (const finding of findings) {
    const leaderView = round3.findings.find(f => f.id === finding.id)
    if (!leaderView) continue

    // Resolved if leader agentAgreement is high (2+ agents agree)
    if (leaderView.agentAgreement >= 2) return true
  }

  // Resolved if leader domain confidence meets threshold
  if (round3.domainConfidence) {
    for (const dc of round3.domainConfidence) {
      if (dc.score >= LEADER_CERTAINTY_THRESHOLD) return true
    }
  }

  return false
}

/**
 * Builds per-agent position map.
 */
function buildPositionMap(findings, round2) {
  const positions = {}

  // Position of finding agent
  for (const f of findings) {
    positions[f.sourceAgent] = `Found: ${f.description?.slice(0, 80) ?? f.id}`
  }

  // Position of the agent that raised disagreement
  for (const agent of round2) {
    for (const d of agent.disagreements ?? []) {
      if (findings.some(f => f.id === d.findingId)) {
        positions[agent.agentId] = `Disagreed: ${d.reason?.slice(0, 80) ?? d.suggestion}`
      }
    }
  }

  return positions
}

/**
 * Generates deadlock summary text.
 */
function buildDeadlockSummary(deadlocks, confidence) {
  if (deadlocks.length === 0) return 'Cross-verification consensus reached — no deadlocks'

  const escalated = deadlocks.filter(d => d.resolution === 'escalate')
  const lines = [`${deadlocks.length} deadlock(s) detected`]

  if (escalated.length > 0) {
    lines.push(`🔴 Human review required: ${escalated.length}`)
    for (const d of escalated) {
      lines.push(`  - ${d.area}: ${d.escalationReason}`)
    }
  }

  const autoResolved = deadlocks.filter(d => d.resolution === 'auto_resolve')
  if (autoResolved.length > 0) {
    lines.push(`✅ Leader auto-resolved: ${autoResolved.length}`)
  }

  return lines.join('\n')
}
