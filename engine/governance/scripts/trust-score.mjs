#!/usr/bin/env node
/**
 * trust-score.mjs — Agent cumulative trust score calculation
 *
 * Usage:
 *   node governance/scripts/trust-score.mjs [--project my-saas-app] [--since 2026-01-01]
 *
 * reports/ path:
 *   governance/reports/                     (default)
 *   {project-root}/.ai-governance/reports/  (when --target specified)
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const { values } = parseArgs({
  options: {
    project: { type: 'string', short: 'p' },
    since: { type: 'string', short: 's' },
    target: { type: 'string', short: 't' },
  },
  strict: false,
})

// Determine reports directory
const reportsDir = values.target
  ? join(resolve(values.target), '.ai-governance', 'reports')
  : join(dirname(__dirname), 'reports')

if (!existsSync(reportsDir)) {
  console.log(`⚠️  No reports — directory does not exist: ${reportsDir}`)
  console.log('Reports are automatically saved when cross-verification is run.')
  process.exit(0)
}

// Collect JSON report files
const sinceDate = values.since ? new Date(values.since) : null
const projectFilter = values.project?.toLowerCase()

const files = readdirSync(reportsDir)
  .filter(f => f.endsWith('.json'))
  .map(f => join(reportsDir, f))

if (files.length === 0) {
  console.log(`⚠️  No reports — no JSON files in ${reportsDir}.`)
  process.exit(0)
}

// Load + filter reports
const reports = []
for (const filePath of files) {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'))

    // Date filter
    if (sinceDate && raw.timestamp) {
      if (new Date(raw.timestamp) < sinceDate) continue
    }

    // Project filter (whether project name is in projectRoot path)
    if (projectFilter && raw.projectRoot) {
      if (!raw.projectRoot.toLowerCase().includes(projectFilter)) continue
    }

    reports.push(raw)
  } catch {
    // Ignore parse-failed reports
  }
}

if (reports.length === 0) {
  console.log(`⚠️  No reports match the criteria.`)
  if (sinceDate) console.log(`   --since: ${values.since}`)
  if (projectFilter) console.log(`   --project: ${values.project}`)
  process.exit(0)
}

// Aggregation
const verdictCounts = { PASS: 0, CONDITIONAL: 0, FAIL: 0 }
const domainScores = {}   // domain → [scores]
let totalConfidence = 0
let confidenceCount = 0

for (const r of reports) {
  // Verdict aggregation
  const v = r.verdict?.toUpperCase()
  if (verdictCounts[v] !== undefined) verdictCounts[v]++

  // Confidence aggregation
  if (typeof r.confidence?.overall === 'number') {
    totalConfidence += r.confidence.overall
    confidenceCount++
  }

  // Per-domain score aggregation
  if (r.confidence?.domains) {
    for (const [domain, d] of Object.entries(r.confidence.domains)) {
      if (typeof d.score === 'number') {
        if (!domainScores[domain]) domainScores[domain] = []
        domainScores[domain].push(d.score)
      }
    }
  }
}

const total = reports.length
const overallScore = confidenceCount > 0
  ? Math.round(totalConfidence / confidenceCount)
  : null

// Output
console.log('')
console.log('Trust Score Report')
console.log('─'.repeat(50))
console.log(`Report count: ${total}`)
if (sinceDate) console.log(`Period: ${values.since} ~`)
if (projectFilter) console.log(`Project filter: ${values.project}`)
console.log('')

// Verdict distribution
const passRate = total > 0 ? Math.round((verdictCounts.PASS / total) * 100) : 0
const condRate  = total > 0 ? Math.round((verdictCounts.CONDITIONAL / total) * 100) : 0
const failRate  = total > 0 ? Math.round((verdictCounts.FAIL / total) * 100) : 0

console.log('Verdict distribution:')
console.log(`  ✅ PASS:        ${verdictCounts.PASS} (${passRate}%)`)
console.log(`  ⚠️  CONDITIONAL: ${verdictCounts.CONDITIONAL} (${condRate}%)`)
console.log(`  ❌ FAIL:        ${verdictCounts.FAIL} (${failRate}%)`)
console.log('')

// Overall confidence
if (overallScore !== null) {
  console.log(`Overall confidence average: ${overallScore} / 100`)
  console.log('')
}

// Per-domain average
if (Object.keys(domainScores).length > 0) {
  console.log('Per-domain average:')
  for (const [domain, scores] of Object.entries(domainScores).sort()) {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    const bar = '█'.repeat(Math.floor(avg / 10)) + '░'.repeat(10 - Math.floor(avg / 10))
    console.log(`  ${domain.padEnd(20)} ${bar} ${avg}`)
  }
  console.log('')
}

console.log('─'.repeat(50))
