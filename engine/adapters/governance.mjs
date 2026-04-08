/**
 * governance.mjs — ai-governance config file generation adapter
 *
 * Reads the `governance:` block from a profile and generates these project files:
 *   - .ai-governance/config.yaml   (preset-based + overrides applied)
 *   - .ai-governance/agents.yaml   (template copy)
 *   - .ai-governance/thresholds.yaml (generated based on preset)
 *
 * Example profile governance block:
 *   governance:
 *     enabled: true
 *     preset: saas                     # solo | small-team | saas
 *     verifiers:
 *       - id: claude-worker
 *         provider: anthropic
 *         model: claude-sonnet-4-6
 *         agents: [structure, convention, domain]
 *     judge:
 *       provider: openai
 *       model: gpt-4o
 *       fallback_provider: anthropic
 *       fallback_model: claude-opus-4-6
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { load as parseYaml, dump as dumpYaml } from 'js-yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const GOVERNANCE_DIR = resolve(__dirname, '..', 'governance')
const PRESETS_DIR = resolve(GOVERNANCE_DIR, 'presets')
const TEMPLATES_DIR = resolve(GOVERNANCE_DIR, 'templates', '.ai-governance')
const HOOKS_TEMPLATES_DIR = resolve(GOVERNANCE_DIR, 'templates', 'hooks')
const WORKFLOWS_TEMPLATES_DIR = resolve(GOVERNANCE_DIR, 'templates', 'workflows')
const SCRIPTS_TEMPLATES_DIR = resolve(GOVERNANCE_DIR, 'templates', 'scripts')

const BASE_THRESHOLDS = {
  solo: { structure: 60, convention: 60, domain: 55 },
  'small-team': { structure: 65, convention: 65, domain: 60 },
  saas: {
    structure: 70,
    convention: 70,
    domain: 65,
    auth: 72,
    api_contract: 70,
    error_handling: 68,
  },
}

/**
 * @param {object} governanceConfig - governance block from profile
 * @param {object} profile - Full profile object
 * @returns {{ path: string, content: string }[]}
 */
export function generate(governanceConfig, profile) {
  if (!governanceConfig?.enabled) return []

  const preset = governanceConfig.preset ?? 'solo'
  const timestamp = new Date().toISOString()
  const files = []

  // 1. config.yaml — load preset + merge profile overrides
  const configContent = buildConfigYaml(preset, governanceConfig, timestamp, profile)
  files.push({
    path: '.ai-governance/config.yaml',
    content: configContent,
  })

  // 2. agents.yaml — copy from template
  const agentsTemplatePath = resolve(TEMPLATES_DIR, 'agents.yaml')
  if (existsSync(agentsTemplatePath)) {
    files.push({
      path: '.ai-governance/agents.yaml',
      content: readFileSync(agentsTemplatePath, 'utf-8'),
    })
  }

  // 3. thresholds.yaml — generate based on preset
  files.push({
    path: '.ai-governance/thresholds.yaml',
    content: buildThresholdsYaml(preset, timestamp, governanceConfig.overrides?.thresholds ?? governanceConfig.thresholds),
  })

  // 4. safety-manifest.yaml — template + profile safety override merge
  const manifestContent = buildSafetyManifestYaml(preset, governanceConfig, timestamp, profile)
  files.push({
    path: '.ai-governance/safety-manifest.yaml',
    content: manifestContent,
  })

  // 5. hooks/guard-reversibility.sh — template copy (requires execute permission)
  const hookTemplatePath = resolve(HOOKS_TEMPLATES_DIR, 'guard-reversibility.sh')
  if (existsSync(hookTemplatePath)) {
    files.push({
      path: '.claude/hooks/guard-reversibility.sh',
      content: readFileSync(hookTemplatePath, 'utf-8'),
      executable: true,
    })
  }

  // 5b. hooks/confirm-capture.sh — UserPromptSubmit hook (CONFIRM token capture)
  const confirmHookPath = resolve(HOOKS_TEMPLATES_DIR, 'confirm-capture.sh')
  if (existsSync(confirmHookPath)) {
    files.push({
      path: '.claude/hooks/confirm-capture.sh',
      content: readFileSync(confirmHookPath, 'utf-8'),
      executable: true,
    })
  }

  // 5d. hooks/guard-branch.sh — PreToolUse(Bash) protected branch commit guard
  const guardBranchPath = resolve(HOOKS_TEMPLATES_DIR, 'guard-branch.sh')
  if (existsSync(guardBranchPath)) {
    files.push({
      path: '.claude/hooks/guard-branch.sh',
      content: readFileSync(guardBranchPath, 'utf-8'),
      executable: true,
    })
  }

  // 5e. hooks/guard-scope.sh — PreToolUse(Edit|Write) out-of-scope edit guard
  // Implements 05-responses Out-of-Scope Edit Disclosure triggers A & B.
  const guardScopePath = resolve(HOOKS_TEMPLATES_DIR, 'guard-scope.sh')
  if (existsSync(guardScopePath)) {
    files.push({
      path: '.claude/hooks/guard-scope.sh',
      content: readFileSync(guardScopePath, 'utf-8'),
      executable: true,
    })
  }

  // 5c. .claude/.gitignore — exclude confirmed-actions directory
  files.push({
    path: '.claude/.gitignore',
    content: '# runtime safety harness — disposable CONFIRM tokens (no commit needed)\nconfirmed-actions/\n',
    ifNotExists: true,
  })

  // 7. .github/workflows/cross-verify.yml — L6 GitHub Actions workflow
  if (governanceConfig.cross_verify?.enabled !== false) {
    const workflowTemplatePath = resolve(WORKFLOWS_TEMPLATES_DIR, 'cross-verify.yml')
    if (existsSync(workflowTemplatePath)) {
      files.push({
        path: '.github/workflows/cross-verify.yml',
        content: readFileSync(workflowTemplatePath, 'utf-8'),
      })
    }
  }

  // 7b. .github/scripts/cross-verify-runner.mjs — verifier/judge execution script
  if (governanceConfig.cross_verify?.enabled !== false) {
    const runnerTemplatePath = resolve(SCRIPTS_TEMPLATES_DIR, 'cross-verify-runner.mjs')
    if (existsSync(runnerTemplatePath)) {
      files.push({
        path: '.github/scripts/cross-verify-runner.mjs',
        content: readFileSync(runnerTemplatePath, 'utf-8'),
        executable: true,
      })
    }
  }

  // 6. .claude/settings.json — hook registration (if-not-exists handled by sync.mjs)
  const settingsContent = buildSettingsJson(governanceConfig)
  if (settingsContent) {
    files.push({
      path: '.claude/settings.json',
      content: settingsContent,
      mergeJson: true,
    })
  }

  return files
}

/**
 * Load preset yaml and merge profile overrides to generate config.yaml content.
 */
function buildConfigYaml(preset, governanceConfig, timestamp, profile) {
  const presetObject = loadPresetObject(preset)
  const crossOverrides = governanceConfig.overrides?.cross_verification ?? {}
  const legacyVerifiers = governanceConfig.verifiers
  const legacyJudge = governanceConfig.judge
  const normalizedJudge = normalizeJudge(crossOverrides.judge ?? legacyJudge)
  const verifiers = crossOverrides.verifiers ?? legacyVerifiers

  if (governanceConfig.release_mode) {
    presetObject.release_mode = governanceConfig.release_mode
  }

  if (!presetObject.cross_verification) {
    presetObject.cross_verification = {}
  }

  const { verifiers: _ignoredVerifiers, judge: _ignoredJudge, ...restCrossOverrides } = crossOverrides
  Object.assign(presetObject.cross_verification, restCrossOverrides)

  if (verifiers) {
    presetObject.cross_verification.verifiers = verifiers
    presetObject.cross_verification.enabled = true
  }

  if (normalizedJudge) {
    presetObject.cross_verification.judge = normalizedJudge
    presetObject.cross_verification.enabled = true
  }

  const header = [
    `# =============================================================================`,
    `# .ai-governance/config.yaml`,
    `# =============================================================================`,
    `# Generated by ai-rules governance adapter`,
    `# Last sync: ${timestamp}`,
    `# Profile: ${profile.project}`,
    `# Preset: ${preset}`,
    `#`,
    `# To switch models, only modify cross_verification.verifiers / judge blocks.`,
    `# No code changes needed — just edit config.yaml and re-run cross-verify.`,
    `# =============================================================================`,
    ``,
  ].join('\n')

  return header + dumpYaml(presetObject, {
    lineWidth: 120,
    noRefs: true,
  }).trim() + '\n'
}

/**
 * Generate thresholds.yaml based on preset.
 */
function buildThresholdsYaml(preset, timestamp, thresholdOverrides = {}) {
  const thresholds = {
    ...(BASE_THRESHOLDS[preset] ?? BASE_THRESHOLDS.solo),
    ...thresholdOverrides,
  }

  const domainNames = Object.keys(thresholds)
  const weight = Number((1 / domainNames.length).toFixed(2))
  const averageScore = Math.round(
    domainNames.reduce((sum, name) => sum + thresholds[name], 0) / domainNames.length
  )

  const yamlObject = {
    version: '1.0',
    preset,
    domains: Object.fromEntries(
      domainNames.map(name => [
        name,
        {
          min_score: thresholds[name],
          weight,
        },
      ])
    ),
    overall_min_score: averageScore,
  }

  const header = [
    `# .ai-governance/thresholds.yaml`,
    `# Generated by ai-rules governance adapter — ${timestamp}`,
    `# Preset: ${preset}`,
    `# Per-domain minimum confidence thresholds (0-100). Below this value = CONDITIONAL verdict.`,
    ``,
  ].join('\n')

  return header + dumpYaml(yamlObject, {
    lineWidth: 120,
    noRefs: true,
  }).trim() + '\n'
}

function loadPresetObject(preset) {
  const presetPath = resolve(PRESETS_DIR, `${preset}.yaml`)
  let presetContent = ''
  if (existsSync(presetPath)) {
    presetContent = readFileSync(presetPath, 'utf-8')
  } else {
    const soloPath = resolve(PRESETS_DIR, 'solo.yaml')
    presetContent = existsSync(soloPath) ? readFileSync(soloPath, 'utf-8') : ''
  }

  return parseYaml(presetContent) ?? {}
}

/**
 * Generate safety-manifest.yaml — load template then merge profile safety.extra_actions
 */
function buildSafetyManifestYaml(preset, governanceConfig, timestamp, profile) {
  const templatePath = resolve(TEMPLATES_DIR, 'safety-manifest.yaml')

  let manifest = {}
  if (existsSync(templatePath)) {
    manifest = parseYaml(readFileSync(templatePath, 'utf-8')) ?? {}
  } else {
    // minimum defaults
    manifest = {
      version: '1.0',
      confirm_phrase_format: 'CONFIRM {action}-{YYYYMMDD}',
      protected_branches: ['main', 'master', 'develop'],
      never_override: [],
      high_risk_actions: [],
    }
  }

  // Append profile.governance.safety.extra_actions
  const extraActions = governanceConfig.safety?.extra_actions ?? []
  if (extraActions.length > 0) {
    manifest.high_risk_actions = [
      ...(manifest.high_risk_actions ?? []),
      ...extraActions,
    ]
  }

  // Override profile.governance.safety.protected_branches
  if (governanceConfig.safety?.protected_branches) {
    manifest.protected_branches = governanceConfig.safety.protected_branches
  }

  // Merge profile.governance.safety.out_of_scope (used by guard-scope.sh).
  // Profile may add to defaults (extra_*) or replace them entirely (shared_dirs / root_config_files).
  // The replace form is preferred for clarity; extra_* exists for projects that want to keep defaults.
  const oosOverride = governanceConfig.safety?.out_of_scope
  if (oosOverride && typeof oosOverride === 'object') {
    const baseOos = manifest.out_of_scope ?? {}
    const merged = {
      shared_dirs: oosOverride.shared_dirs
        ?? [...(baseOos.shared_dirs ?? []), ...(oosOverride.extra_shared_dirs ?? [])],
      root_config_files: oosOverride.root_config_files
        ?? [...(baseOos.root_config_files ?? []), ...(oosOverride.extra_root_config_files ?? [])],
    }
    // Deduplicate while preserving order
    merged.shared_dirs = [...new Set(merged.shared_dirs)]
    merged.root_config_files = [...new Set(merged.root_config_files)]
    manifest.out_of_scope = merged
  }

  const header = [
    `# =============================================================================`,
    `# .ai-governance/safety-manifest.yaml`,
    `# =============================================================================`,
    `# Generated by ai-rules governance adapter`,
    `# Last sync: ${timestamp}`,
    `# Profile: ${profile.project}`,
    `# Preset: ${preset}`,
    `#`,
    `# Do not edit this file directly.`,
    `# Customize via your profile.yaml under governance.safety:`,
    `#   - extra_actions:                  add R2 patterns to high_risk_actions`,
    `#   - protected_branches:             override the default branch list`,
    `#   - out_of_scope.shared_dirs:       REPLACE the default shared-dir list`,
    `#   - out_of_scope.extra_shared_dirs: APPEND to the default shared-dir list`,
    `#   - out_of_scope.root_config_files: REPLACE / .extra_root_config_files: APPEND`,
    `# =============================================================================`,
    ``,
  ].join('\n')

  return header + dumpYaml(manifest, {
    lineWidth: 120,
    noRefs: true,
  }).trim() + '\n'
}

/**
 * Generate .claude/settings.json — register guard-reversibility.sh hook
 */
function buildSettingsJson(governanceConfig) {
  if (!governanceConfig?.enabled) return null

  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: 'bash .claude/hooks/guard-branch.sh',
            },
            {
              type: 'command',
              command: 'bash .claude/hooks/guard-reversibility.sh',
            },
          ],
        },
        {
          matcher: 'Edit|Write|NotebookEdit',
          hooks: [
            {
              type: 'command',
              command: 'bash .claude/hooks/guard-scope.sh',
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: 'command',
              command: 'bash .claude/hooks/confirm-capture.sh',
            },
          ],
        },
      ],
    },
  }

  return JSON.stringify(settings, null, 2) + '\n'
}

function normalizeJudge(judge) {
  if (!judge) return null

  if (judge.primary || judge.fallback || judge.safe_mode_override) {
    return {
      provider: judge.primary?.provider ?? judge.provider ?? 'openai',
      model: judge.primary?.model ?? judge.model ?? 'gpt-4o',
      fallback_provider: judge.fallback?.provider ?? judge.fallback_provider ?? 'anthropic',
      fallback_model: judge.fallback?.model ?? judge.fallback_model ?? 'claude-opus-4-6',
      safe_model: judge.safe_mode_override?.model ?? judge.safe_model ?? judge.model ?? 'gpt-4o',
      ...(judge.safe_mode_override?.provider ? { safe_provider: judge.safe_mode_override.provider } : {}),
    }
  }

  return judge
}
