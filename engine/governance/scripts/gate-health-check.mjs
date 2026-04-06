#!/usr/bin/env node
/**
 * gate-health-check.mjs — Governance config file validation (no LLM calls)
 *
 * Usage: node governance/scripts/gate-health-check.mjs [project-path]
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import yaml from 'js-yaml'

const VALID_PRESETS = ['solo', 'small-team', 'saas']
const ENV_VARS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
}

const projectRoot = resolve(process.argv[2] ?? process.cwd())
const govDir = join(projectRoot, '.ai-governance')

const results = []

function pass(label, msg) {
  results.push({ status: 'PASS', label, msg })
}
function warn(label, msg) {
  results.push({ status: 'WARN', label, msg })
}
function fail(label, msg) {
  results.push({ status: 'FAIL', label, msg })
}

// 1. Check .ai-governance directory exists
if (!existsSync(govDir)) {
  fail('gov-dir', `.ai-governance/ directory not found: ${govDir}`)
  printAndExit()
}
pass('gov-dir', `.ai-governance/ directory exists`)

// 2. config.yaml exists + parse
const configPath = join(govDir, 'config.yaml')
let config = null

if (!existsSync(configPath)) {
  fail('config-exist', 'config.yaml not found')
} else {
  try {
    config = yaml.load(readFileSync(configPath, 'utf-8'))
    pass('config-exist', 'config.yaml exists and parsed successfully')
  } catch (e) {
    fail('config-parse', `config.yaml parse error: ${e.message}`)
  }
}

if (config) {
  // 3. Validate preset value
  if (!config.preset) {
    warn('config-preset', 'preset not set (using defaults)')
  } else if (!VALID_PRESETS.includes(config.preset)) {
    fail('config-preset', `preset '${config.preset}' invalid. Allowed: ${VALID_PRESETS.join(', ')}`)
  } else {
    pass('config-preset', `preset: ${config.preset}`)
  }

  // 4. Check verifier provider env variables
  const verifierProvider = config.cross_verification?.verifier?.provider ?? 'anthropic'
  const verifierEnv = ENV_VARS[verifierProvider]
  if (verifierEnv) {
    if (!process.env[verifierEnv]) {
      warn('env-verifier', `Verifier env variable not set: ${verifierEnv}`)
    } else {
      pass('env-verifier', `Verifier env variable exists: ${verifierEnv}`)
    }
  }

  // 5. Check judge provider env variables
  const judgeProvider = config.cross_verification?.judge?.provider ?? verifierProvider
  const judgeEnv = ENV_VARS[judgeProvider]
  if (judgeEnv && judgeEnv !== verifierEnv) {
    if (!process.env[judgeEnv]) {
      warn('env-judge', `Judge env variable not set: ${judgeEnv}`)
    } else {
      pass('env-judge', `Judge env variable exists: ${judgeEnv}`)
    }
  }
}

// 6. thresholds.yaml exists + value range validation
const thresholdsPath = join(govDir, 'thresholds.yaml')
if (!existsSync(thresholdsPath)) {
  warn('thresholds', 'thresholds.yaml not found (using defaults)')
} else {
  try {
    const t = yaml.load(readFileSync(thresholdsPath, 'utf-8'))
    const values = Object.values(t?.thresholds ?? {})
    const invalid = values.filter(v => typeof v !== 'number' || v < 0 || v > 100)
    if (invalid.length > 0) {
      fail('thresholds-range', `thresholds values out of 0~100 range: ${invalid.join(', ')}`)
    } else {
      pass('thresholds', `thresholds.yaml valid (${values.length} domains)`)
    }
  } catch (e) {
    fail('thresholds-parse', `thresholds.yaml parse error: ${e.message}`)
  }
}

// 7. Check agents.yaml exists
const agentsPath = join(govDir, 'agents.yaml')
if (!existsSync(agentsPath)) {
  warn('agents', 'agents.yaml not found (using default template)')
} else {
  pass('agents', 'agents.yaml exists')
}

printAndExit()

function printAndExit() {
  const statusIcon = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌' }
  const counts = { PASS: 0, WARN: 0, FAIL: 0 }

  console.log('')
  console.log(`Gate Health Check — ${projectRoot}`)
  console.log('─'.repeat(55))

  for (const r of results) {
    counts[r.status]++
    console.log(`${statusIcon[r.status]} [${r.label}] ${r.msg}`)
  }

  console.log('─'.repeat(55))
  console.log(`Result: PASS ${counts.PASS} / WARN ${counts.WARN} / FAIL ${counts.FAIL}`)

  if (counts.FAIL > 0) {
    console.log('\nStatus: FAIL — fix config errors.')
    process.exit(1)
  } else if (counts.WARN > 0) {
    console.log('\nStatus: WARN — review warnings.')
    process.exit(0)
  } else {
    console.log('\nStatus: PASS — all settings are valid.')
    process.exit(0)
  }
}
