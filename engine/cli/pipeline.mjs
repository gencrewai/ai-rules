#!/usr/bin/env node
/**
 * ai-rules CLI — pipeline
 *
 * Usage:
 *   node cli/pipeline.mjs status --project <path>
 *   node cli/pipeline.mjs next --project <path> [--agent-output <file>]
 *   node cli/pipeline.mjs check-gate G1 --project <path>
 *
 * Zero external dependencies — Node.js built-in modules only.
 */

import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readState } from '../lib/pipeline-state.mjs'
import { checkGate, checkAllGates } from '../lib/pipeline-gates.mjs'
import { resolveNext } from '../lib/pipeline-dispatcher.mjs'

// ── Argument Parsing ─────────────────────────────────────────────────────────

const { values: args, positionals } = parseArgs({
  options: {
    project:        { type: 'string',  short: 'p', default: '.' },
    'agent-output': { type: 'string' },
    'review-cycles': { type: 'string', default: '0' },
    output:         { type: 'string',  short: 'o', default: 'text' },
    help:           { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
  strict: false,
})

// ── Help ────────────────────────────────────────────────────────────

if (args.help || positionals.length === 0) {
  console.log(`
ai-rules pipeline — Check pipeline status and determine next action

Usage:
  node cli/pipeline.mjs <command> [options]

Commands:
  status              Print current pipeline status
  next                Determine next agent/action
  check-gate <G1-G4>  Check specific gate
  gates               Print all gate status

Options:
  -p, --project       Project root path (default: .)
      --agent-output  Previous agent output file path (for next command)
      --review-cycles reviewer<->builder iteration count (default: 0)
  -o, --output        Output format: text | json (default: text)
  -h, --help          Help

Examples:
  node cli/pipeline.mjs status --project /path/to/project
  node cli/pipeline.mjs next --project . --agent-output /tmp/reviewer-output.md
  node cli/pipeline.mjs check-gate G3 --project .
  node cli/pipeline.mjs gates --project . --output json
`.trim())
  process.exit(args.help ? 0 : 1)
}

// ── Execution ──────────────────────────────────────────────────────────────

const command = positionals[0]
const projectRoot = resolve(args.project)
const outputJson = args.output === 'json'

try {
  const state = readState(projectRoot)

  switch (command) {
    case 'status': {
      if (outputJson) {
        console.log(JSON.stringify(state, null, 2))
      } else {
        printStatus(state)
      }
      break
    }

    case 'next': {
      const agentOutput = args['agent-output']
        ? readFileSync(resolve(args['agent-output']), 'utf-8')
        : undefined
      const reviewCycles = parseInt(args['review-cycles'], 10) || 0
      const next = resolveNext(state, agentOutput, { reviewCycles })
      const gate = next.gate ? checkGate(next.gate, state, { projectRoot }) : null

      if (outputJson) {
        console.log(JSON.stringify({ state, next, gate }, null, 2))
      } else {
        printNext(next, gate)
      }
      break
    }

    case 'check-gate': {
      const gateId = positionals[1]
      if (!gateId || !['G1', 'G2', 'G3', 'G4'].includes(gateId)) {
        console.error('Specify a gate ID: G1, G2, G3, G4')
        process.exit(1)
      }
      const agentOutput = args['agent-output']
        ? readFileSync(resolve(args['agent-output']), 'utf-8')
        : undefined
      const result = checkGate(gateId, state, { projectRoot, agentOutput })

      if (outputJson) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        printGate(result)
      }
      process.exit(result.passed ? 0 : 1)
      break
    }

    case 'gates': {
      const results = checkAllGates(state, { projectRoot })
      if (outputJson) {
        console.log(JSON.stringify(results, null, 2))
      } else {
        for (const r of results) printGate(r)
      }
      break
    }

    default:
      console.error(`Unknown command: ${command}`)
      process.exit(1)
  }
} catch (err) {
  console.error(`Error: ${err.message}`)
  process.exit(1)
}

// ── Output Formatters ───────────────────────────────────────────────────────

function printStatus(state) {
  console.log('== Pipeline Status ==')
  console.log(`Stage:    ${state.stage}`)
  console.log(`Branch:   ${state.git.branch}`)
  console.log(`Dirty:    ${state.git.dirty ? 'yes' : 'no'}`)
  console.log(`Commit:   ${state.git.lastCommit.slice(0, 8)}`)
  console.log()
  console.log(`INTENT.md:     ${state.intent.exists ? (state.intent.complete ? '✅ Complete' : '⚠️ Incomplete') : '❌ Missing'}`)
  console.log(`DESIGN.md:     ${state.design.required ? (state.design.exists ? '✅ Exists' : '❌ Required but missing') : '— Not required'}`)
  console.log(`SESSION.md:    ${state.session.exists ? '✅ Exists' : '— None'}`)
  console.log(`FAILURE_LOG:   ${state.failures.count > 0 ? `⚠️ Open ${state.failures.count} issue(s)` : '✅ None'}`)
  if (state.failures.diagnoseMode) console.log(`               🔴 DIAGNOSE MODE`)
  console.log()

  if (state.intent.exists) {
    const flags = []
    if (state.intent.needsArchitect) flags.push('architect')
    if (state.intent.needsDesigner) flags.push('designer')
    if (state.intent.needsSecurity) flags.push('security')
    if (flags.length > 0) console.log(`Required agents: ${flags.join(', ')}`)
    if (state.intent.urgent) console.log(`Urgent:        [URGENT]`)
  }
}

function printNext(next, gate) {
  console.log('== Next Action ==')
  console.log(`Action:   ${next.action}`)
  if (next.agent) console.log(`Agent:    ${next.agent}`)
  if (next.gate) console.log(`Gate:     ${next.gate}`)
  console.log(`Reason:   ${next.reason}`)

  if (gate) {
    console.log()
    printGate(gate)
  }
}

function printGate(result) {
  const icon = result.passed ? '✅' : '❌'
  const skip = result.skippable ? ' (skippable)' : ' (cannot skip)'
  console.log(`${icon} ${result.gate}${result.passed ? '' : skip}: ${result.reason}`)
  for (const c of result.checks) {
    const ci = c.passed ? '  ✓' : '  ✗'
    console.log(`${ci} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
  }
}
