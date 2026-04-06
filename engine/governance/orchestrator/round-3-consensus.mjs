/**
 * Round 3: Consensus — Leader/Judge independent judgment
 *
 * GPT-4o (or Claude Opus fallback) receives all Round 1+2 results and
 * makes an independent final judgment.
 *
 * Key: Uses a different model from Workers to avoid shared hallucination issues.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Executes Round 3 (Leader/Judge judgment).
 *
 * @param {object[]} round1Results - Round 1 per-agent results
 * @param {object[]} round2Results - Round 2 cross-check results
 * @param {{ chat: Function, getInfo: Function }} leaderClient - Leader LLM client
 * @param {{ verbose?: boolean }} [opts]
 * @returns {Promise<Round3Result>}
 */
export async function runRound3(round1Results, round2Results, leaderClient, opts = {}) {
  const { verbose, debug, contextSummary } = opts
  const leaderInfo = leaderClient.getInfo()

  if (verbose) {
    console.log(`\n── Round 3: Leader Judgment ──`)
    console.log(`  Leader model: ${leaderInfo.model} (${leaderInfo.provider})`)
  }

  // Load leader prompt
  const systemPrompt = loadLeaderPrompt()

  // Build full results message
  const userMessage = buildRound3UserMessage(round1Results, round2Results, contextSummary)

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  if (verbose) {
    console.log(`  ⏳ Leader judging...`)
  }

  try {
    const response = await leaderClient.chat(messages, { maxTokens: 4096, temperature: 0 })

    // debug: full Leader response output
    if (debug) {
      console.log(`\n  ┌─ Leader (${leaderInfo.model}) Judgment Response ─────────`)
      const lines = response.content.split('\n')
      for (const line of lines) {
        console.log(`  │ ${line}`)
      }
      console.log(`  └──────────────────────────────────────────`)
    }

    let result = response.parsed

    // Retry on JSON parse failure
    if (!result?.verdict) {
      if (verbose) console.log(`  ⚠️  Leader JSON parse failed, retrying...`)

      const retryMessages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: 'Please respond with pure JSON only. No markdown code blocks. No explanatory text.' },
      ]

      const retryResponse = await leaderClient.chat(retryMessages, { maxTokens: 4096, temperature: 0 })
      result = retryResponse.parsed

      if (!result?.verdict) {
        // Final failure — conservative CONDITIONAL verdict
        result = {
          verdict: 'CONDITIONAL',
          verdictReason: 'Leader response parse failure — manual review required',
          findings: [],
          domainConfidence: [],
          conditions: ['Please review the Leader judgment result manually'],
          missedFindings: [],
        }
      }
    }

    // Merge missedFindings into findings
    const allFindings = [...(result.findings ?? [])]
    if (result.missedFindings) {
      for (const mf of result.missedFindings) {
        allFindings.push({
          ...mf,
          agentAgreement: 0,
          leaderOverride: true,
        })
      }
    }

    if (verbose) {
      console.log(`  ✅ Leader verdict: ${result.verdict}`)
      console.log(`     Reason: ${result.verdictReason ?? '(none)'}`)
      console.log(`     Findings: ${allFindings.length} (${response.latencyMs}ms)`)
    }

    // debug: Leader judgment details
    if (debug) {
      console.log(`\n  ⚖️  Leader Final Judgment Details:`)
      console.log(`     Verdict: ${result.verdict}`)
      console.log(`     Reason: ${result.verdictReason ?? '(none)'}`)
      if (result.conditions?.length > 0) {
        console.log(`     Conditions:`)
        for (const c of result.conditions) {
          console.log(`       - ${c}`)
        }
      }
      if (allFindings.length > 0) {
        console.log(`     Findings:`)
        for (const f of allFindings) {
          const icon = f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : '🔵'
          const override = f.leaderOverride ? ' [Leader independent finding]' : ''
          console.log(`       ${icon} [${f.id}] ${f.severity}: ${f.description}${override}`)
        }
      }
      if (result.missedFindings?.length > 0) {
        console.log(`     🔍 Missed by workers:`)
        for (const mf of result.missedFindings) {
          console.log(`       🔴 ${mf.description}`)
        }
      }
    }

    return {
      verdict: result.verdict,
      verdictReason: result.verdictReason ?? '',
      findings: allFindings,
      domainConfidence: result.domainConfidence ?? [],
      conditions: result.conditions ?? [],
      leaderModel: leaderInfo.model,
      usage: response.usage,
      latencyMs: response.latencyMs,
    }
  } catch (err) {
    if (verbose) console.log(`  ❌ Leader error: ${err.message}`)

    // Conservative verdict on error
    return {
      verdict: 'CONDITIONAL',
      verdictReason: `Leader execution error: ${err.message}`,
      findings: [],
      domainConfidence: [],
      conditions: ['Leader judgment failed — manual review required'],
      leaderModel: leaderInfo.model,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latencyMs: 0,
    }
  }
}

/**
 * Loads the Leader prompt.
 *
 * @returns {string}
 */
function loadLeaderPrompt() {
  const promptPath = resolve(__dirname, 'prompts', 'leader-judge.md')
  try {
    return readFileSync(promptPath, 'utf-8')
  } catch {
    throw new Error(`Leader prompt file not found: ${promptPath}`)
  }
}

/**
 * Builds the Round 3 user message.
 *
 * @param {object[]} round1Results
 * @param {object[]} round2Results
 * @returns {string}
 */
function buildRound3UserMessage(round1Results, round2Results, contextSummary) {
  const sections = [
    'Review the following cross-verification results and provide your independent judgment.',
    '',
  ]

  // Insert project context summary
  if (contextSummary) {
    sections.push('## Project Context (Summary)')
    sections.push('The code under review belongs to a project with these key rules:')
    sections.push(contextSummary)
    sections.push('')
  }

  sections.push('## Round 1: Independent Analysis Results')

  for (const r1 of round1Results) {
    sections.push(`### ${r1.agentId} Agent`)
    sections.push(`Findings: ${r1.findings.length}`)
    sections.push(JSON.stringify(r1.findings, null, 2))
    sections.push('')
  }

  if (round2Results) {
    sections.push('## Round 2: Cross-Check Results')

    for (const r2 of round2Results) {
      sections.push(`### ${r2.agentId} Agent — Cross-Check`)
      sections.push(`Agreements: ${r2.agreements.length}`)
      sections.push(JSON.stringify(r2.agreements, null, 2))
      sections.push(`Disagreements: ${r2.disagreements.length}`)
      sections.push(JSON.stringify(r2.disagreements, null, 2))
      if (r2.newFindings?.length > 0) {
        sections.push(`New Findings: ${r2.newFindings.length}`)
        sections.push(JSON.stringify(r2.newFindings, null, 2))
      }
      sections.push('')
    }
  }

  sections.push('## Instructions')
  sections.push('Provide your independent judgment as JSON. Focus on:')
  sections.push('1. Are the findings genuine issues or false positives?')
  sections.push('2. Are there findings the worker agents may have missed?')
  sections.push('3. What is the final verdict: PASS, FAIL, or CONDITIONAL?')

  return sections.join('\n')
}
