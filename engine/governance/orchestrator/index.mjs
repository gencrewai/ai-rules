#!/usr/bin/env node
/**
 * Cross-Verification Orchestrator — main entry point
 *
 * CLI:
 *   node orchestrator/index.mjs --target <project> --diff <file> [--rounds 3] [--output json|text] [--verbose]
 *
 * Module:
 *   import { runCrossVerification } from './orchestrator/index.mjs'
 *   const report = await runCrossVerification({ projectRoot, diff })
 */

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { parseArgs } from 'util'

import { loadConfig, loadYaml } from '../scripts/lib/config-loader.mjs'
import { createVerifierClients, createJudgeClient } from './llm-client.mjs'
import { runRound1 } from './round-1-independent.mjs'
import { runRound2 } from './round-2-cross-check.mjs'
import { runRound3 } from './round-3-consensus.mjs'
import { calculateConfidence } from './confidence-calculator.mjs'
import { detectDeadlocks, handleDeadlocks } from './deadlock-handler.mjs'
import { loadProjectContext, formatContextSummaryForLeader } from './context-collector.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Runs cross-verification.
 *
 * @param {object} options
 * @param {string} options.projectRoot - Target project root path
 * @param {string} options.diff - Diff content (string)
 * @param {string} [options.configPath] - config.yaml path override
 * @param {number} [options.rounds] - Round count override (1-3)
 * @param {boolean} [options.verbose] - Verbose log output
 * @returns {Promise<EvalReport>} Cross-verification result
 */
export async function runCrossVerification(options) {
  const { projectRoot, diff, configPath, rounds, verbose, debug, contextLevel } = options
  const startMs = Date.now()

  if (!diff || diff.trim().length === 0) {
    throw new Error('diff is empty')
  }

  // 1. Load config
  let config
  try {
    const loaded = loadConfig({ projectRoot, configPath })
    config = loaded.config
  } catch {
    // Use defaults if no config
    config = {
      cross_verification: { enabled: true, rounds: 3 },
    }
  }

  const crossVerConfig = config.cross_verification ?? {}

  // 2. Load agent definitions
  const agentsFile = crossVerConfig.agents_file ?? '.ai-governance/agents.yaml'
  let agentsDef

  const agentsPath = resolve(projectRoot, agentsFile)
  if (existsSync(agentsPath)) {
    agentsDef = loadYaml(agentsPath)
  } else {
    // Use default template if not in project
    const defaultAgentsPath = resolve(__dirname, '..', 'templates', '.ai-governance', 'agents.yaml')
    if (existsSync(defaultAgentsPath)) {
      agentsDef = loadYaml(defaultAgentsPath)
    } else {
      throw new Error('Cannot find agents.yaml. Initialize with init_governance.')
    }
  }

  // 3. Create LLM clients (provider-agnostic)
  const verifierClients = createVerifierClients(crossVerConfig)
  const judgeClient = createJudgeClient(crossVerConfig, config.release_mode)
  // Backward compat: round-1 expects single client, use first verifier as default worker
  const workerClient = verifierClients[0].client

  // 4. Determine round count
  const maxRounds = Math.min(Math.max(rounds ?? crossVerConfig.rounds ?? 3, 1), 3)

  // 4.5. Determine context level (CLI > config > default)
  const ctxLevel = contextLevel ?? crossVerConfig.context?.level ?? 'standard'

  if (verbose) {
    console.log('═'.repeat(60))
    console.log('  Cross-Verification Start')
    console.log('═'.repeat(60))
    console.log(`  Project: ${projectRoot}`)
    console.log(`  Rounds: ${maxRounds}`)
    console.log(`  Context: ${ctxLevel}`)
    for (const v of verifierClients) {
      console.log(`  Verifier[${v.id}]: ${v.client.getInfo().provider}/${v.client.getInfo().model} → ${v.agents.join(', ')}`)
    }
    console.log(`  Judge: ${judgeClient.getInfo().provider}/${judgeClient.getInfo().model}${judgeClient.degraded ? ' (degraded)' : ''}`)
    console.log(`  Diff length: ${diff.length} chars`)
  }

  // 5. Token/cost tracking
  const costTracker = { totalTokens: 0, totalCost: 0 }

  // 5.5. Project context options
  const contextOptions = ctxLevel !== 'none' ? {
    level: ctxLevel,
    projectRoot,
    extraFiles: crossVerConfig.context?.extra_files ?? [],
    maxCharsPerAgent: crossVerConfig.context?.max_chars_per_agent ?? 4000,
  } : null

  // 6. Round 1: Independent analysis
  const round1Results = await runRound1(diff, agentsDef, workerClient, { verbose, debug, contextOptions })
  trackCost(costTracker, round1Results)

  // Budget check
  const budget = crossVerConfig.budget?.max_cost_usd ?? 0.50
  if (costTracker.totalCost > budget) {
    if (verbose) console.log(`Budget exceeded (${costTracker.totalCost.toFixed(4)} > ${budget}). Ending with Round 1 only.`)
    return buildReport({ round1Results, maxRounds: 1, costTracker, startMs, workerClient, leaderClient, config, projectRoot })
  }

  // 7. Round 2: Cross-check (2+ rounds)
  let round2Results = null
  if (maxRounds >= 2) {
    round2Results = await runRound2(round1Results, agentsDef, workerClient, { verbose, debug })
    trackCost(costTracker, round2Results)
  }

  // 8. Round 3: Judge verdict (3 rounds)
  let round3Result = null
  if (maxRounds >= 3) {
    let contextSummary = null
    if (contextOptions) {
      const ctx = loadProjectContext(projectRoot, { level: 'minimal' })
      contextSummary = formatContextSummaryForLeader(ctx)
    }

    round3Result = await runRound3(round1Results, round2Results, judgeClient, { verbose, debug, contextSummary })
    trackCost(costTracker, [round3Result])
  }

  // 9. Generate report
  return buildReport({ round1Results, round2Results, round3Result, maxRounds, costTracker, startMs, workerClient, judgeClient, config, projectRoot })
}

/**
 * Builds the final eval report.
 */
function buildReport({ round1Results, round2Results, round3Result, maxRounds, costTracker, startMs, workerClient, judgeClient, config, projectRoot }) {
  const leaderClient = judgeClient  // Internal backward compat alias
  // Calculate confidence score
  const confidence = calculateConfidence({
    round1: round1Results,
    round2: round2Results,
    round3: round3Result,
    config,
    projectRoot,
  })

  // Detect deadlocks
  const deadlocks = detectDeadlocks(round1Results, round2Results, round3Result)
  if (deadlocks.length > 0) {
    handleDeadlocks(deadlocks, confidence)
  }

  // Determine final verdict
  let verdict, verdictReason, conditions

  if (round3Result) {
    verdict = round3Result.verdict
    verdictReason = round3Result.verdictReason
    conditions = round3Result.conditions
  } else {
    // Without Round 3, judge based on Round 1/2
    const hasCritical = round1Results.some(r =>
      r.findings.some(f => f.severity === 'critical')
    )
    verdict = hasCritical ? 'FAIL' : (confidence.passesThreshold ? 'PASS' : 'CONDITIONAL')
    verdictReason = hasCritical
      ? 'Critical findings detected'
      : (confidence.passesThreshold ? 'All domains passed thresholds' : 'Some domains below thresholds')
    conditions = confidence.passesThreshold ? [] : ['Review domains below confidence threshold']
  }

  // Verdict adjustment due to deadlocks
  const escalatedDeadlocks = deadlocks.filter(d => d.resolution === 'escalate')
  if (escalatedDeadlocks.length > 0 && verdict === 'PASS') {
    verdict = 'CONDITIONAL'
    verdictReason += ` (${escalatedDeadlocks.length} deadlock(s) escalated)`
    conditions = [...(conditions ?? []), ...escalatedDeadlocks.map(d => d.escalationReason)]
  }

  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    verdict,
    verdictReason,
    conditions: conditions ?? [],
    rounds: {
      round1: { agents: round1Results },
      ...(round2Results ? { round2: { agents: round2Results } } : {}),
      ...(round3Result ? { round3: round3Result } : {}),
    },
    confidence,
    deadlocks,
    models: {
      worker: workerClient.getInfo().model,
      leader: leaderClient.getInfo().model,
    },
    cost: {
      totalTokens: costTracker.totalTokens,
      estimatedCostUsd: Math.round(costTracker.totalCost * 10000) / 10000,
    },
    durationMs: Date.now() - startMs,
  }
}

/**
 * Auto-generates the report save path.
 * .ai-governance/reports/YYYY-MM-DD_HHmmss.json
 *
 * @param {string} projectRoot
 * @returns {string}
 */
function generateReportPath(projectRoot) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return resolve(projectRoot, '.ai-governance', 'reports', `${ts}.json`)
}

/**
 * Cost/token tracking
 */
function trackCost(tracker, results) {
  if (!results) return
  const items = Array.isArray(results) ? results : [results]
  for (const r of items) {
    if (r.usage) {
      tracker.totalTokens += r.usage.totalTokens ?? 0
    }
    if (r.cost != null) {
      tracker.totalCost += r.cost
    }
    // Agent results inside round results
    if (r.agents) {
      for (const agent of r.agents) {
        if (agent.usage) tracker.totalTokens += agent.usage.totalTokens ?? 0
      }
    }
  }
}

/**
 * Text format report formatting
 *
 * @param {EvalReport} report
 * @returns {string}
 */
export function formatEvalReportText(report) {
  const lines = [
    '═'.repeat(60),
    '  Cross-verification result',
    '═'.repeat(60),
    '',
    `Verdict: ${report.verdict}`,
    `Reason: ${report.verdictReason}`,
    '',
  ]

  if (report.conditions?.length > 0) {
    lines.push('Conditions:')
    for (const c of report.conditions) {
      lines.push(`  - ${c}`)
    }
    lines.push('')
  }

  // Round 1 summary
  lines.push('── Round 1: Independent Analysis ──')
  for (const agent of report.rounds.round1.agents) {
    const criticals = agent.findings.filter(f => f.severity === 'critical').length
    const warnings = agent.findings.filter(f => f.severity === 'warning').length
    lines.push(`  ${agent.agentId}: ${agent.findings.length} findings (critical: ${criticals}, warning: ${warnings})`)
  }
  lines.push('')

  // Round 2 summary
  if (report.rounds.round2) {
    lines.push('── Round 2: Cross-Check ──')
    for (const agent of report.rounds.round2.agents) {
      lines.push(`  ${agent.agentId}: agreements ${agent.agreements.length}, disagreements ${agent.disagreements.length}, new ${(agent.newFindings ?? []).length}`)
    }
    lines.push('')
  }

  // Round 3 summary
  if (report.rounds.round3) {
    lines.push('── Round 3: Leader Verdict ──')
    lines.push(`  Model: ${report.rounds.round3.leaderModel}`)
    lines.push(`  Verdict: ${report.rounds.round3.verdict}`)
    lines.push(`  Findings: ${report.rounds.round3.findings.length}`)
    lines.push('')
  }

  // Confidence
  lines.push('── Confidence Score ──')
  lines.push(`  Overall: ${report.confidence.overall}`)
  lines.push(`  Threshold passed: ${report.confidence.passesThreshold ? '✅' : '❌'}`)
  if (report.confidence.domains) {
    for (const [name, d] of Object.entries(report.confidence.domains)) {
      lines.push(`  ${name}: ${d.score} / ${d.threshold} (${d.passes ? '✅' : '❌'} Δ${d.delta >= 0 ? '+' : ''}${d.delta})`)
    }
  }
  lines.push('')

  // Deadlocks
  if (report.deadlocks?.length > 0) {
    lines.push('── Deadlocks ──')
    for (const d of report.deadlocks) {
      lines.push(`  ${d.resolution === 'escalate' ? '🔴' : '✅'} ${d.area}: ${d.resolution}`)
    }
    lines.push('')
  }

  // Cost
  lines.push('── Cost ──')
  lines.push(`  Tokens: ${report.cost.totalTokens.toLocaleString()}`)
  lines.push(`  Cost: ${report.cost.estimatedCostUsd}`)
  lines.push(`  Duration: ${(report.durationMs / 1000).toFixed(1)}s`)
  lines.push('')
  lines.push(`Models: Worker=${report.models.worker}, Leader=${report.models.leader}`)
  lines.push('═'.repeat(60))

  return lines.join('\n')
}

// ── CLI Entry Point ───────────────────────────────────────────────────────

const isDirectRun = (() => {
  try {
    const scriptPath = resolve(process.argv[1] ?? '').replace(/\\/g, '/')
    const modulePath = __filename.replace(/\\/g, '/')
    return scriptPath === modulePath
  } catch {
    return false
  }
})()

if (isDirectRun) {
  const { values } = parseArgs({
    options: {
      target: { type: 'string', short: 't' },
      diff: { type: 'string', short: 'd' },
      rounds: { type: 'string', short: 'r' },
      output: { type: 'string', short: 'o', default: 'text' },
      out: { type: 'string' },
      context: { type: 'string', short: 'c', default: 'standard' },
      verbose: { type: 'boolean', short: 'v', default: false },
      debug: { type: 'boolean', default: false },
    },
    strict: false,
  })

  if (!values.target) {
    console.error('Usage: node orchestrator/index.mjs --target <project-root> --diff <diff-file>')
    console.error('')
    console.error('Options:')
    console.error('  --target, -t  Target project root path (required)')
    console.error('  --diff, -d    Diff file path or "-" (stdin) (required)')
    console.error('  --rounds, -r  Number of rounds (1-3, default: 3)')
    console.error('  --output, -o  Output format (json|text, default: text)')
    console.error('  --verbose, -v Verbose log output')
    console.error('  --context, -c Context level (none|minimal|standard|full, default: standard)')
    console.error('  --debug       Real-time agent discussion output')
    console.error('  --out <file>  Save results to file (auto-saves to .ai-governance/reports/ if not specified)')
    process.exit(1)
  }

  // Read diff
  let diff
  if (!values.diff || values.diff === '-') {
    // Read from stdin
    const chunks = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk)
    }
    diff = Buffer.concat(chunks).toString('utf-8')
  } else {
    diff = readFileSync(resolve(values.diff), 'utf-8')
  }

  try {
    const report = await runCrossVerification({
      projectRoot: resolve(values.target),
      diff,
      rounds: values.rounds ? parseInt(values.rounds, 10) : undefined,
      contextLevel: values.context,
      verbose: values.verbose,
      debug: values.debug,
    })

    // Determine output path: use --out if specified, auto-generate otherwise
    const outPath = values.out
      ? resolve(values.out)
      : generateReportPath(resolve(values.target))

    // Force JSON when using --out or auto-save
    const useJson = values.output === 'json' || !values.out
    const outputText = useJson
      ? JSON.stringify(report, null, 2)
      : formatEvalReportText(report)

    // Auto-create directory + save file
    const outDir = dirname(outPath)
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true })
    }
    writeFileSync(outPath, outputText, 'utf-8')
    console.log(`Result saved: ${outPath}`)

    // Also print text summary to terminal
    console.log(formatEvalReportText(report))

    // Exit code: 1 if FAIL
    process.exit(report.verdict === 'FAIL' ? 1 : 0)
  } catch (err) {
    console.error(`Cross-verification error: ${err.message}`)
    process.exit(2)
  }
}
