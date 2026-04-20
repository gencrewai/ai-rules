/**
 * scaffold-agents.mjs — Multi-tool agent deployment for the scaffold CLI.
 *
 * The `sync` engine owns full multi-tool deployment via profile YAML, but most
 * users spinning up a brand-new project only want the agents to show up in
 * their tool of choice without writing a profile first. This module ships
 * `core/agents/*.md` into the common AI runners directly from `scaffoldProject`.
 *
 * Design notes:
 *   - Pure filesystem ops by default (claude-code, codex). No external deps.
 *   - Cursor's MDC conversion reuses the real adapter + `js-yaml`, loaded
 *     lazily so scaffold's "zero-install" guarantee still holds when the
 *     user only asks for claude-code.
 *   - Rules files (CLAUDE.md / AGENTS.md / .cursor/rules/) are intentionally
 *     out of scope here — those need the profile-based assembly pipeline in
 *     sync.mjs. Scaffold only takes care of the agent side.
 */

import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync,
} from 'fs'
import { dirname, join } from 'path'

/** Tools scaffold can deploy agents for without writing a profile. */
export const SCAFFOLD_AGENT_TOOLS = ['claude-code', 'codex', 'cursor']

/**
 * Deploy agents for one tool.
 *
 * @param {object} opts
 * @param {string} opts.tool          One of SCAFFOLD_AGENT_TOOLS
 * @param {string} opts.aiRulesRoot   Path to ai-rules repo (has core/agents/)
 * @param {string} opts.projectDir    Target project directory
 * @param {(msg: string) => void} opts.logger
 * @returns {Promise<number>} number of files written
 */
export async function deployAgentsForTool({ tool, aiRulesRoot, projectDir, logger }) {
  const agentsSrc = join(aiRulesRoot, 'core', 'agents')
  if (!existsSync(agentsSrc)) {
    logger(`SKIP ${tool}: core/agents/ not found at ${agentsSrc}`)
    return 0
  }
  const agentFiles = readdirSync(agentsSrc).filter(f => f.endsWith('.md'))
  if (agentFiles.length === 0) {
    logger(`SKIP ${tool}: no agent files under core/agents/`)
    return 0
  }

  switch (tool) {
    case 'claude-code':
      return deployClaudeCode(agentFiles, agentsSrc, projectDir, logger)
    case 'codex':
      return deployCodex(agentFiles, agentsSrc, projectDir, logger)
    case 'cursor':
      return await deployCursor(agentFiles, agentsSrc, projectDir, logger)
    default:
      logger(`SKIP ${tool}: unsupported by scaffold (expected one of ${SCAFFOLD_AGENT_TOOLS.join(', ')})`)
      return 0
  }
}

// ── claude-code ───────────────────────────────────────────────────────────
// Native layout — copy verbatim.

function deployClaudeCode(files, srcDir, projectDir, logger) {
  const dstDir = join(projectDir, '.claude', 'agents')
  mkdirSync(dstDir, { recursive: true })
  for (const f of files) {
    copyFileSync(join(srcDir, f), join(dstDir, f))
    logger(`COPY: .claude/agents/${f}`)
  }
  return files.length
}

// ── codex ─────────────────────────────────────────────────────────────────
// Native subagent support — preserve frontmatter, only rewrite Claude paths.
// Regex-only so we don't need js-yaml here.

function deployCodex(files, srcDir, projectDir, logger) {
  const dstDir = join(projectDir, '.codex', 'agents')
  mkdirSync(dstDir, { recursive: true })
  for (const f of files) {
    const src = readFileSync(join(srcDir, f), 'utf-8')
    const rewritten = rewriteClaudePathsToCodex(src)
    writeFileSync(join(dstDir, f), rewritten)
    logger(`COPY: .codex/agents/${f}`)
  }
  return files.length
}

function rewriteClaudePathsToCodex(content) {
  return content
    .replace(/\.claude\/agents\//g, '.codex/agents/')
    .replace(/\bCLAUDE\.md\b/g, 'AGENTS.md')
}

// ── cursor ────────────────────────────────────────────────────────────────
// Non-native: Claude agent → `.cursor/rules/agents/{name}.mdc` with MDC
// frontmatter, path rewrites, Claude-directive neutralization. Requires
// `js-yaml` via agent-transform.mjs → loaded lazily.

async function deployCursor(files, srcDir, projectDir, logger) {
  let transform, cursorAdapter
  try {
    transform = await import('./agent-transform.mjs')
    cursorAdapter = await import('../adapters/cursor.mjs')
  } catch (err) {
    logger(`ERROR deploying cursor agents: ${err.message}`)
    logger(`HINT: run "npm install" in the ai-rules repo so Cursor's MDC conversion can load js-yaml, then retry with --tools cursor.`)
    return 0
  }

  const agents = files.map(fname => {
    const raw = readFileSync(join(srcDir, fname), 'utf-8')
    const { frontmatter, body } = transform.parseAgentMarkdown(raw)
    return {
      name: fname.replace(/\.md$/, ''),
      content: raw,
      frontmatter,
      body,
    }
  })

  const toolConfig = {
    agents: { enabled: true, output: '.cursor/rules/agents/' },
  }
  const fakeProfile = { project: 'scaffold' }
  const out = cursorAdapter.generateAgents(agents, toolConfig, fakeProfile)

  for (const file of out) {
    const dst = join(projectDir, file.path)
    mkdirSync(dirname(dst), { recursive: true })
    writeFileSync(dst, file.content)
    logger(`COPY: ${file.path}`)
  }
  return out.length
}

/**
 * Parse a `--tools` CLI value ("claude-code,codex,cursor") into a
 * validated, de-duplicated array. Unknown tools are returned separately so
 * the CLI can warn the user.
 *
 * @param {string | undefined} value
 * @param {string[]} [defaults]
 * @returns {{ tools: string[], unknown: string[] }}
 */
export function parseToolsArg(value, defaults = ['claude-code']) {
  if (!value) return { tools: [...defaults], unknown: [] }
  const tokens = value.split(',').map(s => s.trim()).filter(Boolean)
  const tools = []
  const unknown = []
  for (const t of tokens) {
    if (SCAFFOLD_AGENT_TOOLS.includes(t)) {
      if (!tools.includes(t)) tools.push(t)
    } else {
      unknown.push(t)
    }
  }
  if (tools.length === 0) tools.push(...defaults)
  return { tools, unknown }
}
