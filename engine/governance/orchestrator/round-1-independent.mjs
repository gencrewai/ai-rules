/**
 * Round 1: Independent Analysis — 3-agent parallel independent analysis
 *
 * Each agent (structure, convention, domain) independently analyzes the code diff
 * to produce a Finding[] list. No result sharing between agents.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loadProjectContext, formatContextForMessage } from './context-collector.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PROMPTS_DIR = resolve(__dirname, 'prompts')

// Max diff length (token savings)
const MAX_DIFF_CHARS = 32000

/**
 * Executes Round 1.
 *
 * @param {string} diff - Code change diff (unified diff format)
 * @param {object} agentsDef - agents.yaml parsed result
 * @param {{ chat: Function }} client - Worker LLM client
 * @param {{ verbose?: boolean }} [opts]
 * @returns {Promise<Round1AgentResult[]>}
 */
export async function runRound1(diff, agentsDef, client, opts = {}) {
  const { verbose, debug, contextOptions } = opts
  const agents = agentsDef?.agents ?? []

  if (agents.length === 0) {
    throw new Error('No agents defined in agents.yaml')
  }

  // Diff length limit
  const truncatedDiff = truncateDiff(diff)

  // File cache (shared by all 3 agents)
  const fileCache = new Map()

  if (verbose) {
    console.log(`\n── Round 1: Independent Analysis ──`)
    console.log(`  Agents: ${agents.map(a => a.id).join(', ')}`)
    console.log(`  Diff length: ${diff.length} → ${truncatedDiff.length} chars`)
    if (contextOptions) {
      console.log(`  Context: ${contextOptions.level}`)
    }
  }

  // Run 3 agents in parallel
  const results = await Promise.all(
    agents.map(agent => analyzeWithAgent(agent, truncatedDiff, client, verbose, debug, contextOptions, fileCache))
  )

  if (verbose) {
    const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0)
    console.log(`  Results: ${totalFindings} findings (${results.map(r => `${r.agentId}:${r.findings.length}`).join(', ')})`)
  }

  return results
}

/**
 * Runs analysis with a single agent.
 *
 * @param {object} agentDef - Agent definition from agents.yaml
 * @param {string} diff - Code diff
 * @param {{ chat: Function }} client - LLM client
 * @param {boolean} [verbose]
 * @returns {Promise<Round1AgentResult>}
 */
async function analyzeWithAgent(agentDef, diff, client, verbose, debug, contextOptions, fileCache) {
  const { id, name, description, focus_areas, checks } = agentDef

  // Load prompt
  const systemPrompt = loadAgentPrompt(id)

  // Load project context
  let contextString = ''
  if (contextOptions) {
    const context = loadProjectContext(contextOptions.projectRoot, {
      level: contextOptions.level,
      agentId: id,
      extraFiles: contextOptions.extraFiles,
      maxCharsPerAgent: contextOptions.maxCharsPerAgent,
      _fileCache: fileCache,
    })
    contextString = formatContextForMessage(context)

    if (verbose && context.sections.length > 0) {
      console.log(`  📚 ${name}: Context ${context.sections.length} sections, ${context.totalChars} chars (~${context.tokenEstimate} tokens)`)
    }
  }

  // Build user message
  const userMessage = buildRound1UserMessage(diff, { description, focus_areas, checks }, contextString)

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  if (verbose) {
    console.log(`  ⏳ ${name} analyzing...`)
  }

  try {
    const response = await client.chat(messages, { maxTokens: 4096, temperature: 0 })

    // debug: full agent response output
    if (debug) {
      console.log(`\n  ┌─ ${name} Response ─────────────────────────────`)
      const lines = response.content.split('\n')
      for (const line of lines) {
        console.log(`  │ ${line}`)
      }
      console.log(`  └──────────────────────────────────────────`)
    }

    // JSON parsing
    let findings = []
    if (response.parsed?.findings) {
      findings = response.parsed.findings
    } else {
      // Retry on parse failure
      if (verbose) console.log(`  ⚠️  ${name}: JSON parse failed, retrying...`)

      const retryMessages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: 'Please respond again in JSON format. Output pure JSON only without markdown code blocks.' },
      ]

      const retryResponse = await client.chat(retryMessages, { maxTokens: 4096, temperature: 0 })

      if (retryResponse.parsed?.findings) {
        findings = retryResponse.parsed.findings
      } else {
        // Final failure — wrap raw text as info finding
        findings = [{
          id: `${id.toUpperCase().slice(0, 3)}-000`,
          severity: 'info',
          category: focus_areas?.[0] ?? 'general',
          file: null,
          line: null,
          description: `[Parse failure] ${response.content.slice(0, 500)}`,
          suggestion: 'LLM response is not in JSON format. Manual review required.',
          confidence: 30,
        }]
      }
    }

    // Finding ID normalization (prefix unification)
    const prefix = getIdPrefix(id)
    findings = findings.map((f, i) => ({
      ...f,
      id: f.id ?? `${prefix}-${String(i + 1).padStart(3, '0')}`,
    }))

    if (verbose) {
      console.log(`  ✅ ${name}: ${findings.length} findings (${response.latencyMs}ms, ${response.usage.totalTokens} tokens)`)
    }

    // debug: findings summary
    if (debug && findings.length > 0) {
      console.log(`  📋 ${name} findings:`)
      for (const f of findings) {
        const icon = f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : '🔵'
        console.log(`     ${icon} [${f.id}] ${f.severity}: ${f.description}`)
        if (f.suggestion) console.log(`        → ${f.suggestion}`)
      }
    }

    return {
      agentId: id,
      findings,
      usage: response.usage,
      latencyMs: response.latencyMs,
    }
  } catch (err) {
    if (verbose) console.log(`  ❌ ${name}: ${err.message}`)

    return {
      agentId: id,
      findings: [{
        id: `${getIdPrefix(id)}-ERR`,
        severity: 'info',
        category: 'general',
        file: null,
        line: null,
        description: `Agent execution error: ${err.message}`,
        suggestion: 'Manual review required',
        confidence: 0,
      }],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latencyMs: 0,
    }
  }
}

/**
 * Loads the agent prompt file.
 *
 * @param {string} agentId - Agent ID
 * @returns {string}
 */
function loadAgentPrompt(agentId) {
  const promptPath = resolve(PROMPTS_DIR, `${agentId}-agent.md`)
  try {
    return readFileSync(promptPath, 'utf-8')
  } catch {
    throw new Error(`Agent prompt file not found: ${promptPath}`)
  }
}

/**
 * Builds the Round 1 user message.
 *
 * @param {string} diff
 * @param {object} agentDef
 * @returns {string}
 */
function buildRound1UserMessage(diff, { description, focus_areas, checks }, contextString) {
  const sections = [
    'Analyze the following code changes (diff).',
    '',
  ]

  // Insert project context (before diff — LLM reads rules before analyzing diff)
  if (contextString) {
    sections.push(contextString)
    sections.push('')
  }

  sections.push(
    `## Analysis Perspective`,
    description ?? '',
    '',
    `## Focus Areas`,
    ...(focus_areas ?? []).map(a => `- ${a}`),
    '',
    `## Checklist`,
    ...(checks ?? []).map(c => `- ${c}`),
    '',
    `## Diff`,
    '```diff',
    diff,
    '```',
  )

  return sections.join('\n')
}

/**
 * Truncates diff to maximum length.
 *
 * @param {string} diff
 * @returns {string}
 */
function truncateDiff(diff) {
  if (diff.length <= MAX_DIFF_CHARS) return diff

  const truncated = diff.slice(-MAX_DIFF_CHARS)
  const lineBreak = truncated.indexOf('\n')
  const clean = lineBreak > 0 ? truncated.slice(lineBreak + 1) : truncated

  return `[TRUNCATED: last ${clean.length} chars of original ${diff.length} chars included]\n${clean}`
}

/**
 * Generates Finding ID prefix from agent ID.
 *
 * @param {string} agentId
 * @returns {string}
 */
function getIdPrefix(agentId) {
  const prefixes = {
    structure: 'STR',
    convention: 'CON',
    domain: 'DOM',
  }
  return prefixes[agentId] ?? agentId.toUpperCase().slice(0, 3)
}
