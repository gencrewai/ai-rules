#!/usr/bin/env node
/**
 * eval-runner.mjs — Evaluate governance verification with test cases
 *
 * Usage:
 *   node governance/scripts/eval-runner.mjs [--dry-run]
 *
 * evals/ directory structure:
 *   governance/evals/*.yaml
 *   Each file: { description, input, expected_verdict }
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import yaml from 'js-yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const GOVERNANCE_ROOT = resolve(__dirname, '..')
const EVALS_DIR = join(GOVERNANCE_ROOT, 'evals')

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    verbose: { type: 'boolean', short: 'v', default: false },
    target: { type: 'string', short: 't', default: process.cwd() },
  },
  strict: false,
})

const isDryRun = values['dry-run']
const verbose = values.verbose
const projectRoot = resolve(values.target)

// Check evals directory
if (!existsSync(EVALS_DIR)) {
  console.log(`⚠️  evals/ directory not found: ${EVALS_DIR}`)
  console.log('')
  console.log('To add test case files:')
  console.log(`  mkdir -p ${EVALS_DIR}`)
  console.log('  # Write YAML files with this structure:')
  console.log('  # description: "description"')
  console.log('  # expected_verdict: "PASS" | "CONDITIONAL" | "FAIL"')
  console.log('  # input: |')
  console.log('  #   diff content or code to verify')
  process.exit(0)
}

// Load eval cases
const yamlFiles = readdirSync(EVALS_DIR).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))

if (yamlFiles.length === 0) {
  console.log(`⚠️  No YAML files in evals/ directory: ${EVALS_DIR}`)
  process.exit(0)
}

const cases = []
for (const file of yamlFiles) {
  const filePath = join(EVALS_DIR, file)
  try {
    const raw = yaml.load(readFileSync(filePath, 'utf-8'))
    // Support both single case and array
    const items = Array.isArray(raw) ? raw : [raw]
    for (const item of items) {
      if (!item.input || !item.expected_verdict) {
        console.warn(`⚠️  [${file}] missing input or expected_verdict — skipping`)
        continue
      }
      cases.push({ ...item, _file: file })
    }
  } catch (e) {
    console.error(`❌ [${file}] parse error: ${e.message}`)
  }
}

console.log(`\n Eval Runner — ${cases.length} cases loaded`)
console.log('─'.repeat(55))

// dry-run: output case list only
if (isDryRun) {
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    console.log(`  [${i + 1}] ${c.description ?? '(no description)'} → expected: ${c.expected_verdict}  (${c._file})`)
  }
  console.log('')
  console.log(`Total ${cases.length} cases (--dry-run: no LLM calls)`)
  process.exit(0)
}

// Actual execution: call orchestrator
const { runCrossVerification } = await import('../orchestrator/index.mjs')

let passed = 0
let failed = 0

for (let i = 0; i < cases.length; i++) {
  const c = cases[i]
  const label = c.description ?? `Case ${i + 1}`
  process.stdout.write(`  [${i + 1}/${cases.length}] ${label} ... `)

  try {
    const report = await runCrossVerification({
      projectRoot,
      diff: c.input,
      verbose: false,
    })

    const actual = report.verdict
    const expected = c.expected_verdict.toUpperCase()

    if (actual === expected) {
      passed++
      console.log(`✅ PASS (${actual})`)
    } else {
      failed++
      console.log(`❌ FAIL — expected: ${expected}, actual: ${actual}`)
      if (verbose && report.verdictReason) {
        console.log(`      reason: ${report.verdictReason}`)
      }
    }
  } catch (e) {
    failed++
    console.log(`❌ ERROR — ${e.message}`)
  }
}

console.log('─'.repeat(55))
console.log(`Result: ${passed}/${cases.length} passed  (failed: ${failed})`)
console.log('')

process.exit(failed > 0 ? 1 : 0)
