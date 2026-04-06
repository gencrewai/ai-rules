/**
 * Round 2: Cross-Check — Cross Review
 *
 * Each agent reviews all Round 1 results (including their own) and generates
 * agreements, disagreements, and new findings.
 */

/**
 * Executes Round 2.
 *
 * @param {object[]} round1Results - Round 1 per-agent results array
 * @param {object} agentsDef - agents.yaml parsed result
 * @param {{ chat: Function }} client - Worker LLM client
 * @param {{ verbose?: boolean }} [opts]
 * @returns {Promise<Round2AgentResult[]>}
 */
export async function runRound2(round1Results, agentsDef, client, opts = {}) {
  const { verbose, debug } = opts
  const agents = agentsDef?.agents ?? []

  if (verbose) {
    console.log(`\n── Round 2: Cross-Check ──`)
  }

  // Run 3 agents in parallel
  const results = await Promise.all(
    agents.map(agent => crossCheckWithAgent(agent, round1Results, client, verbose, debug))
  )

  if (verbose) {
    for (const r of results) {
      console.log(`  ✅ ${r.agentId}: agree ${r.agreements.length}, disagree ${r.disagreements.length}, new ${(r.newFindings ?? []).length}`)
    }
  }

  return results
}

/**
 * Runs cross-check with a single agent.
 *
 * @param {object} agentDef - Agent definition from agents.yaml
 * @param {object[]} round1Results - Complete Round 1 results
 * @param {{ chat: Function }} client
 * @param {boolean} [verbose]
 * @returns {Promise<Round2AgentResult>}
 */
async function crossCheckWithAgent(agentDef, round1Results, client, verbose, debug) {
  const { id, name } = agentDef

  const userMessage = buildRound2UserMessage(id, round1Results)
  const prefix = getIdPrefix(id)

  const systemPrompt = `You are ${name}. You perform cross-verification after Round 1 independent analysis.

## Cross-Verification Rules
1. Specify findings from other agents that you **agree** with (findingId + reason)
2. Specify findings from other agents that you **disagree** with (findingId + reason + suggestion)
3. Add any **new findings** discovered after reviewing other agents\' analysis

## Disagreement Suggestion Types
- retract: The finding should be retracted (false positive)
- modify: Severity or description should be modified
- maintain: Maintain my original position

## Output Format
You must respond in JSON format. Output pure JSON only without markdown code blocks.

{
  "agentId": "${id}",
  "agreements": [
    { "findingId": "STR-001", "reason": "Reason for agreement" }
  ],
  "disagreements": [
    { "findingId": "DOM-001", "reason": "Reason for disagreement", "suggestion": "retract | modify | maintain" }
  ],
  "newFindings": [
    {
      "id": "${prefix}-R2-001",
      "severity": "critical | warning | info",
      "category": "category",
      "file": "file-path",
      "line": null,
      "description": "New finding description",
      "suggestion": "Suggested fix",
      "confidence": 75
    }
  ]
}`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  if (verbose) {
    console.log(`  ⏳ ${name} cross-checking...`)
  }

  try {
    const response = await client.chat(messages, { maxTokens: 4096, temperature: 0 })

    // debug: full cross-check response output
    if (debug) {
      console.log(`\n  ┌─ ${name} Cross-Check Response ──────────────────`)
      const lines = response.content.split('\n')
      for (const line of lines) {
        console.log(`  │ ${line}`)
      }
      console.log(`  └──────────────────────────────────────────`)
    }

    const parsed = response.parsed ?? {}

    // debug: agreement/disagreement/new finding details
    if (debug) {
      if (parsed.agreements?.length > 0) {
        console.log(`  🤝 ${name} agreements:`)
        for (const a of parsed.agreements) {
          console.log(`     ✅ ${a.findingId}: ${a.reason}`)
        }
      }
      if (parsed.disagreements?.length > 0) {
        console.log(`  ⚔️  ${name} disagreements:`)
        for (const d of parsed.disagreements) {
          console.log(`     ❌ ${d.findingId}: ${d.reason} → ${d.suggestion}`)
        }
      }
      if (parsed.newFindings?.length > 0) {
        console.log(`  🆕 ${name} new findings:`)
        for (const f of parsed.newFindings) {
          const icon = f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : '🔵'
          console.log(`     ${icon} [${f.id}] ${f.description}`)
        }
      }
    }

    return {
      agentId: id,
      agreements: parsed.agreements ?? [],
      disagreements: parsed.disagreements ?? [],
      newFindings: parsed.newFindings ?? [],
      usage: response.usage,
      latencyMs: response.latencyMs,
    }
  } catch (err) {
    if (verbose) console.log(`  ❌ ${name}: ${err.message}`)

    return {
      agentId: id,
      agreements: [],
      disagreements: [],
      newFindings: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latencyMs: 0,
    }
  }
}

/**
 * Builds the Round 2 user message.
 *
 * @param {string} currentAgentId - Current agent ID
 * @param {object[]} round1Results - Complete Round 1 results
 * @returns {string}
 */
function buildRound2UserMessage(currentAgentId, round1Results) {
  const sections = ['Cross-verify the Round 1 analysis results.', '']

  // Own results
  const ownResult = round1Results.find(r => r.agentId === currentAgentId)
  if (ownResult) {
    sections.push('## Your Round 1 Analysis Results')
    sections.push(JSON.stringify(ownResult.findings, null, 2))
    sections.push('')
  }

  // Other agents' results
  sections.push('## Other Agents\' Round 1 Analysis Results')
  for (const result of round1Results) {
    if (result.agentId === currentAgentId) continue
    sections.push(`### ${result.agentId} Agent`)
    sections.push(JSON.stringify(result.findings, null, 2))
    sections.push('')
  }

  sections.push('Review the results above and respond in JSON with agreements/disagreements/new findings.')

  return sections.join('\n')
}

/**
 * Generates Finding ID prefix from agent ID.
 */
function getIdPrefix(agentId) {
  const prefixes = {
    structure: 'STR',
    convention: 'CON',
    domain: 'DOM',
  }
  return prefixes[agentId] ?? agentId.toUpperCase().slice(0, 3)
}
