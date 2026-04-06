#!/usr/bin/env node
/**
 * cross-verify-runner.mjs — L6 AI Cross-Verification Runner
 *
 * Runs in GitHub Actions. Context injected via environment variables.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  — Anthropic API key (required)
 *   PR_NUMBER          — PR number
 *   PR_TITLE           — PR title
 *   PR_BODY            — PR body
 *
 * Input files:
 *   pr.diff                         — gh pr diff output
 *   .ai-governance/config.yaml      — governance config (verifier/judge models)
 *   .ai-governance/agents.yaml      — agent definitions (focus_areas, checks)
 *   .ai-governance/thresholds.yaml  — score thresholds
 *
 * Output files:
 *   cross-verify-result.json — judgment result (read by workflow)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import Anthropic from '@anthropic-ai/sdk'
import yaml from 'js-yaml'

// ── Load env & files ──────────────────────────────────────────────────────────
const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  writeResult({ verdict: 'ERROR', summary: 'ANTHROPIC_API_KEY environment variable not set' })
  process.exit(1)
}

const client = new Anthropic({ apiKey })

const prDiff = existsSync('pr.diff') ? readFileSync('pr.diff', 'utf-8') : ''
const prTitle = process.env.PR_TITLE || '(no title)'
const prBody = process.env.PR_BODY || ''

const config = loadYaml('.ai-governance/config.yaml') ?? {}
const agentsDef = loadYaml('.ai-governance/agents.yaml') ?? {}
const thresholds = loadYaml('.ai-governance/thresholds.yaml') ?? {}

// Check cross_verification enabled
const crossVerifyCfg = config.cross_verification ?? {}
if (!crossVerifyCfg.enabled) {
  writeResult({
    verdict: 'PASS',
    summary: 'cross_verification.enabled = false — skipping verification',
  })
  process.exit(0)
}

// Limit diff size (token savings)
const MAX_DIFF_CHARS = 20000
const truncatedDiff = prDiff.length > MAX_DIFF_CHARS
  ? prDiff.slice(0, MAX_DIFF_CHARS) + '\n\n... (diff truncated)'
  : prDiff

// ── Determine verifier model ────────────────────────────────────────────────────────
const verifiers = crossVerifyCfg.verifiers ?? []
const judgeConfig = crossVerifyCfg.judge ?? {}

const defaultVerifierModel = 'claude-sonnet-4-6'
const judgeModel = judgeConfig.model ?? 'claude-opus-4-6'

// Get agent definitions from agents.yaml
const agentDefs = (agentsDef.agents ?? []).reduce((acc, a) => {
  acc[a.id] = a
  return acc
}, {})

// ── Run verifier agents (parallel) ─────────────────────────────────────────────
const agentIds = verifiers.length > 0
  ? verifiers.flatMap(v => v.agents ?? [])
  : Object.keys(agentDefs)

if (agentIds.length === 0) {
  writeResult({
    verdict: 'PASS',
    summary: 'No verifier agents defined — skipping verification',
  })
  process.exit(0)
}

console.log(`[cross-verify] Running verifiers: ${agentIds.join(', ')}`)

const verifierPromises = agentIds.map(agentId => runVerifier(agentId))
const verifierResults = await Promise.allSettled(verifierPromises)
  .then(results => results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value
    return {
      agent_id: agentIds[i],
      score: 0,
      comment: `Verifier execution error: ${r.reason?.message ?? r.reason}`,
      error: true,
    }
  }))

// ── Run judge agent ───────────────────────────────────────────────────────
console.log(`[cross-verify] Running judge: ${judgeModel}`)
const judgeResult = await runJudge(verifierResults)

// ── Final verdict ─────────────────────────────────────────────────────────────────
const overallMin = thresholds.overall_min_score ?? 60
const domainThresholds = thresholds.domains ?? {}

// Check each verifier score
const belowThreshold = verifierResults.filter(v => {
  const minScore = domainThresholds[v.agent_id]?.min_score ?? overallMin
  return (v.score ?? 0) < minScore
})

let verdict
if (judgeResult.verdict === 'FAIL' || verifierResults.some(v => v.error)) {
  verdict = 'FAIL'
} else if (judgeResult.verdict === 'CONDITIONAL' || belowThreshold.length > 0) {
  verdict = 'CONDITIONAL'
} else {
  verdict = 'PASS'
}

const summary = buildSummary(verdict, verifierResults, belowThreshold, overallMin)

writeResult({
  verdict,
  summary,
  verifier_results: verifierResults,
  judge_comment: judgeResult.comment,
})

console.log(`[cross-verify] Verdict: ${verdict}`)
process.exit(verdict === 'FAIL' ? 1 : 0)

// ── Functions ──────────────────────────────────────────────────────────────────────

async function runVerifier(agentId) {
  const agentDef = agentDefs[agentId] ?? { id: agentId, name: agentId, checks: [] }
  const model = getVerifierModel(agentId)

  const checks = (agentDef.checks ?? []).join('\n- ')
  const focusAreas = (agentDef.focus_areas ?? []).join(', ')

  const prompt = `You are a code review expert. Evaluate the following PR diff from the "${agentDef.name ?? agentId}" perspective.

## PR Info
Title: ${prTitle}
${prBody ? `Body:\n${prBody}\n` : ''}

## Evaluation Perspective
Focus areas: ${focusAreas || agentId}

Evaluation items:
- ${checks || 'Overall code quality'}

## PR Diff
\`\`\`diff
${truncatedDiff}
\`\`\`

## Response Format (JSON only)
{
  "score": <0-100 integer>,
  "issues": [
    { "severity": "HIGH|MEDIUM|LOW", "file": "file-path", "description": "Issue description" }
  ],
  "comment": "Overall evaluation summary (3-5 sentences)"
}

Score criteria: 90+ PASS, 70-89 caution, 60-69 CONDITIONAL, below 60 FAIL recommended.`

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0]?.text ?? ''
  let parsed
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? '{}')
  } catch {
    parsed = { score: 50, comment: text.slice(0, 500), issues: [] }
  }

  return {
    agent_id: agentId,
    score: Math.min(100, Math.max(0, Number(parsed.score) || 50)),
    issues: parsed.issues ?? [],
    comment: parsed.comment ?? '',
  }
}

async function runJudge(verifierResults) {
  const verifierSummary = verifierResults.map(v =>
    `- ${v.agent_id}: ${v.score}/100\n  ${v.comment}`
  ).join('\n')

  const prompt = `You are an AI code verification judge. Synthesize the verifier results below and make a final judgment.

## Verifier Results
${verifierSummary}

## Judgment Criteria
- PASS: All major items meet thresholds, no critical issues
- CONDITIONAL: Important but non-blocking issues exist (merge allowed, follow-up recommended)
- FAIL: Critical issues requiring immediate fix (security vulnerabilities, data loss risk, etc.)

## Response Format (JSON only)
{
  "verdict": "PASS|CONDITIONAL|FAIL",
  "comment": "Judgment rationale (3-5 sentences)"
}`

  const response = await client.messages.create({
    model: judgeModel,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0]?.text ?? ''
  let parsed
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? '{}')
  } catch {
    parsed = { verdict: 'CONDITIONAL', comment: text.slice(0, 300) }
  }

  const validVerdicts = ['PASS', 'CONDITIONAL', 'FAIL']
  return {
    verdict: validVerdicts.includes(parsed.verdict) ? parsed.verdict : 'CONDITIONAL',
    comment: parsed.comment ?? '',
  }
}

function getVerifierModel(agentId) {
  for (const v of verifiers) {
    if ((v.agents ?? []).includes(agentId)) {
      return v.model ?? defaultVerifierModel
    }
  }
  return defaultVerifierModel
}

function buildSummary(verdict, verifierResults, belowThreshold, overallMin) {
  const lines = [`**Verdict: ${verdict}**`]
  lines.push('')
  lines.push('| Agent | Score | Status |')
  lines.push('|-------|-------|------|')
  for (const v of verifierResults) {
    const min = belowThreshold.find(b => b.agent_id === v.agent_id) ? overallMin : null
    const status = v.error ? '❌ ERROR' : (min ? `⚠️ (threshold: ${min})` : '✅')
    lines.push(`| ${v.agent_id} | ${v.score ?? '?'}/100 | ${status} |`)
  }
  return lines.join('\n')
}

function writeResult(result) {
  writeFileSync('cross-verify-result.json', JSON.stringify(result, null, 2), 'utf-8')
}

function loadYaml(path) {
  if (!existsSync(path)) return null
  try {
    return yaml.load(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}
