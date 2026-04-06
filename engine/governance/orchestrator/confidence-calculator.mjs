/**
 * Confidence Score Calculator
 *
 * Phase 2 simplified formula:
 *   domain_confidence = (agent_agreement * 0.57) + (gate_pass_rate * 0.43)
 *
 * When pattern_match(0.2) + historical(0.1) are added in Phase 3,
 * restore original weights (0.4/0.3/0.2/0.1).
 */

import { loadYaml } from '../scripts/lib/config-loader.mjs'
import { resolve } from 'path'
import { existsSync } from 'fs'

// Phase 2 weights (renormalize 0.4+0.3 = 0.7 to 1.0)
const W_AGREEMENT = 0.57 // 0.4 / 0.7
const W_GATE_PASS = 0.43 // 0.3 / 0.7

/**
 * Calculates per-domain confidence scores.
 *
 * @param {object} params
 * @param {object[]} params.round1 - Round 1 agent results array
 * @param {object[]|null} params.round2 - Round 2 cross-check results array
 * @param {object|null} params.round3 - Round 3 leader verdict result
 * @param {object} params.config - Governance config (including cross_verification)
 * @param {string} [params.projectRoot] - Project root (for loading thresholds.yaml)
 * @returns {ConfidenceResult}
 */
export function calculateConfidence({ round1, round2, round3, config, projectRoot }) {
  // Load thresholds
  const thresholds = loadThresholds(config, projectRoot)

  // Collect domains (categories) from all findings
  const allFindings = collectAllFindings(round1, round2)
  const domains = extractDomains(allFindings)

  // Calculate per-domain scores
  const domainScores = {}

  for (const domain of domains) {
    const agreement = calcAgentAgreement(domain, round1, round2, round3)
    const gatePass = calcGatePassRate(domain, round1)
    const score = Math.round((agreement * W_AGREEMENT + gatePass * W_GATE_PASS) * 100)
    const threshold = thresholds[domain] ?? thresholds.default ?? 70

    domainScores[domain] = {
      domain,
      score,
      threshold,
      passes: score >= threshold,
      delta: score - threshold,
    }
  }

  // Overall confidence = weighted domain average (domain agent weight 0.5)
  const overall = calcOverallScore(domainScores)
  const passesThreshold = Object.values(domainScores).every(d => d.passes)

  return {
    domains: domainScores,
    overall,
    passesThreshold,
  }
}

/**
 * Load thresholds.yaml. Uses defaults if not found.
 *
 * @param {object} config
 * @param {string} [projectRoot]
 * @returns {object} Per-domain thresholds
 */
function loadThresholds(config, projectRoot) {
  const defaults = {
    default: 70,
    ui_components: 65,
    utils: 70,
    business_logic: 75,
    auth: 85,
    payment: 90,
  }

  if (!projectRoot) return defaults

  const thresholdFile = config?.gates?.gate_2?.thresholds_file ?? '.ai-governance/thresholds.yaml'
  const thresholdPath = resolve(projectRoot, thresholdFile)

  if (!existsSync(thresholdPath)) return defaults

  try {
    const loaded = loadYaml(thresholdPath)
    return { ...defaults, ...loaded?.thresholds }
  } catch {
    return defaults
  }
}

/**
 * Collects all findings from Round 1 + Round 2.
 *
 * @param {object[]} round1
 * @param {object[]|null} round2
 * @returns {object[]}
 */
function collectAllFindings(round1, round2) {
  const findings = []

  for (const agent of round1) {
    for (const f of agent.findings ?? []) {
      findings.push({ ...f, sourceAgent: agent.agentId, round: 1 })
    }
  }

  if (round2) {
    for (const agent of round2) {
      for (const f of agent.newFindings ?? []) {
        findings.push({ ...f, sourceAgent: agent.agentId, round: 2 })
      }
    }
  }

  return findings
}

/**
 * Extracts unique domain (category) list from findings.
 *
 * @param {object[]} findings
 * @returns {string[]}
 */
function extractDomains(findings) {
  const domains = new Set()
  for (const f of findings) {
    if (f.category) domains.add(f.category)
  }
  // Ensure at least 1 domain
  if (domains.size === 0) domains.add('general')
  return [...domains]
}

/**
 * Calculates agent agreement rate for a specific domain.
 *
 * @param {string} domain
 * @param {object[]} round1
 * @param {object[]|null} round2
 * @param {object|null} round3
 * @returns {number} 0.0 ~ 1.0
 */
function calcAgentAgreement(domain, round1, round2, round3) {
  // Collect Round 1 findings for this domain
  const domainFindings = []
  for (const agent of round1) {
    for (const f of agent.findings ?? []) {
      if (f.category === domain) {
        domainFindings.push({ ...f, sourceAgent: agent.agentId })
      }
    }
  }

  if (domainFindings.length === 0) return 1.0 // No findings = agreement (no issues)

  // Round 2 agreement analysis
  if (!round2) {
    // With Round 1 only, average agent self-confidence
    const avgConf = domainFindings.reduce((sum, f) => sum + (f.confidence ?? 70), 0) / domainFindings.length
    return avgConf / 100
  }

  let totalScore = 0
  let totalWeight = 0

  for (const finding of domainFindings) {
    let score = 1 // The discovering agent itself

    for (const r2Agent of round2) {
      if (r2Agent.agentId === finding.sourceAgent) continue

      const agreed = r2Agent.agreements?.find(a => a.findingId === finding.id)
      const disagreed = r2Agent.disagreements?.find(d => d.findingId === finding.id)

      if (agreed) score += 1
      else if (disagreed) score -= 0.5
    }

    // Apply Round 3 leader verdict
    if (round3?.findings) {
      const leaderFinding = round3.findings.find(f => f.id === finding.id)
      if (leaderFinding) {
        if (leaderFinding.leaderOverride) score -= 0.5
        else score += 1
      }
    }

    // Normalize: min 0, max = 1(self) + 2(other agents) + 1(leader) = 4
    const normalized = Math.max(0, Math.min(score / 4, 1))
    totalScore += normalized
    totalWeight += 1
  }

  return totalWeight > 0 ? totalScore / totalWeight : 1.0
}

/**
 * Calculates gate pass rate.
 * Phase 2: 1.0 if no critical findings, proportional decrease otherwise.
 *
 * @param {string} domain
 * @param {object[]} round1
 * @returns {number} 0.0 ~ 1.0
 */
function calcGatePassRate(domain, round1) {
  let total = 0
  let criticals = 0

  for (const agent of round1) {
    for (const f of agent.findings ?? []) {
      if (f.category === domain) {
        total++
        if (f.severity === 'critical') criticals++
      }
    }
  }

  if (total === 0) return 1.0
  return 1.0 - criticals / total
}

/**
 * Overall confidence score (weighted domain average).
 *
 * @param {object} domainScores
 * @returns {number} 0-100
 */
function calcOverallScore(domainScores) {
  const scores = Object.values(domainScores)
  if (scores.length === 0) return 100

  const sum = scores.reduce((acc, d) => acc + d.score, 0)
  return Math.round(sum / scores.length)
}
