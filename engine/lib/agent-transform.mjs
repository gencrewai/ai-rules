/**
 * agent-transform.mjs — Shared helpers for multi-tool agent adapters.
 *
 * Each AI tool (Claude Code / Codex / Gemini / Cursor / Windsurf / Copilot / Cline)
 * consumes "agents" in a different shape. These utilities perform the
 * shape-independent transformations that every adapter needs:
 *
 *   1. Frontmatter parsing / stringifying
 *   2. Internal path rewriting (".claude/agents/..." → tool-specific path)
 *   3. Neutralizing Claude-only call sites (e.g. "invoke the Task tool")
 *
 * Adapters stay thin — they pick the right mapping table here and decide
 * the output path / file layout.
 */

import { load as parseYaml, dump as dumpYaml } from 'js-yaml'

/**
 * Split a markdown document into frontmatter object + body string.
 * Returns { frontmatter: object, body: string, raw: string }.
 * If no frontmatter is present, frontmatter is {} and body equals input.
 */
export function parseAgentMarkdown(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content, raw: '' }
  const raw = match[1].replace(/\r/g, '')
  let frontmatter = {}
  try {
    frontmatter = parseYaml(raw) || {}
  } catch (_) {
    frontmatter = {}
  }
  return { frontmatter, body: match[2], raw }
}

/**
 * Stringify frontmatter object → YAML block WITHOUT the surrounding --- fences.
 * Keeps keys in insertion order.
 */
export function stringifyFrontmatter(fm) {
  if (!fm || Object.keys(fm).length === 0) return ''
  return dumpYaml(fm, { lineWidth: 1000, noRefs: true }).trimEnd()
}

/**
 * Wrap frontmatter + body back into a full markdown document.
 */
export function composeMarkdown(frontmatter, body) {
  const yaml = stringifyFrontmatter(frontmatter)
  if (!yaml) return body
  return `---\n${yaml}\n---\n${body}`
}

/**
 * Per-tool path mapping table.
 * Keys are Claude-native references found in core/agents/*.md;
 * values are what they should become for each target tool.
 *
 * Each mapping is { from, to } where `from` is a RegExp (with g flag) or string.
 */
const TOOL_PATH_MAPS = {
  'claude-code': null, // no rewrite
  codex: [
    { from: /`\.\/CLAUDE\.md`/g, to: '`AGENTS.md`' },
    { from: /`CLAUDE\.md`/g, to: '`AGENTS.md`' },
    { from: /\.\/CLAUDE\.md/g, to: 'AGENTS.md' },
    { from: /\bCLAUDE\.md\b/g, to: 'AGENTS.md' },
    { from: /\.claude\/agents\//g, to: '.codex/agents/' },
    { from: /\.claude\//g, to: '.codex/' },
  ],
  cursor: [
    { from: /`\.\/CLAUDE\.md`/g, to: '`.cursor/rules/`' },
    { from: /`CLAUDE\.md`/g, to: '`.cursor/rules/`' },
    { from: /\.\/CLAUDE\.md/g, to: '.cursor/rules/' },
    { from: /\bCLAUDE\.md\b/g, to: '.cursor/rules/' },
    { from: /\.claude\/agents\//g, to: '.cursor/rules/agents/' },
    { from: /\.claude\//g, to: '.cursor/' },
  ],
  windsurf: [
    { from: /`\.\/CLAUDE\.md`/g, to: '`.windsurf/rules`' },
    { from: /`CLAUDE\.md`/g, to: '`.windsurf/rules`' },
    { from: /\.\/CLAUDE\.md/g, to: '.windsurf/rules' },
    { from: /\bCLAUDE\.md\b/g, to: '.windsurf/rules' },
    { from: /\.claude\/agents\//g, to: '.windsurf/rules/agents/' },
    { from: /\.claude\//g, to: '.windsurf/' },
  ],
  gemini: [
    { from: /`\.\/CLAUDE\.md`/g, to: '`GEMINI.md`' },
    { from: /`CLAUDE\.md`/g, to: '`GEMINI.md`' },
    { from: /\.\/CLAUDE\.md/g, to: 'GEMINI.md' },
    { from: /\bCLAUDE\.md\b/g, to: 'GEMINI.md' },
    { from: /\.claude\/agents\//g, to: '.gemini/agents/' },
    { from: /\.claude\//g, to: '.gemini/' },
  ],
  copilot: [
    { from: /`\.\/CLAUDE\.md`/g, to: '`.github/copilot-instructions.md`' },
    { from: /`CLAUDE\.md`/g, to: '`.github/copilot-instructions.md`' },
    { from: /\.\/CLAUDE\.md/g, to: '.github/copilot-instructions.md' },
    { from: /\bCLAUDE\.md\b/g, to: '.github/copilot-instructions.md' },
    { from: /\.claude\/agents\//g, to: '.github/copilot-agents/' },
    { from: /\.claude\//g, to: '.github/' },
  ],
  cline: [
    { from: /`\.\/CLAUDE\.md`/g, to: '`.clinerules`' },
    { from: /`CLAUDE\.md`/g, to: '`.clinerules`' },
    { from: /\.\/CLAUDE\.md/g, to: '.clinerules' },
    { from: /\bCLAUDE\.md\b/g, to: '.clinerules' },
    { from: /\.claude\/agents\//g, to: '.cline/agents/' },
    { from: /\.claude\//g, to: '.cline/' },
  ],
}

/**
 * Rewrite internal references ("CLAUDE.md", ".claude/agents/...") to whatever
 * the target tool expects. Pass the tool key (e.g. 'codex').
 */
export function rewritePaths(content, tool) {
  const map = TOOL_PATH_MAPS[tool]
  if (!map) return content
  let out = content
  for (const { from, to } of map) out = out.replace(from, to)
  return out
}

/**
 * Tools without a native subagent mechanism (Cursor / Windsurf / Gemini / Copilot / Cline).
 * For those we neutralize Claude-specific call sites so the resulting prompt
 * reads as a role guideline instead of an executable invocation.
 *
 * Conservative: only replaces a small list of well-known phrases.
 */
const CLAUDE_CALL_SITE_REPLACEMENTS = [
  // "invoke the Task tool" / "use the Task tool" variants
  { from: /\b(?:invoke|use|call|spawn)\s+the\s+Task\s+tool\b/gi, to: 'act in this role' },
  { from: /\bTask\s+tool\b/g, to: 'role prompt' },
  // "summon the {agent} subagent" → "act as the {agent} role"
  { from: /\bsummon(?:ing)?\s+the\s+([a-z-]+)\s+subagent\b/gi, to: 'act as the $1 role' },
  { from: /\bsubagent\b/g, to: 'role' },
]

/**
 * Strip / neutralize Claude-only call conventions. Safe for all non-Claude tools.
 */
export function neutralizeClaudeDirectives(content) {
  let out = content
  for (const { from, to } of CLAUDE_CALL_SITE_REPLACEMENTS) {
    out = out.replace(from, to)
  }
  return out
}

/**
 * Convert an agent YAML frontmatter object (Claude format) into an MDC
 * frontmatter object suitable for `.cursor/rules/*.mdc`.
 *
 * Claude frontmatter example:
 *   name: planner
 *   description: >
 *     Work analysis...
 *   tools: [Read, Glob, Grep]
 *
 * Cursor MDC expects at minimum:
 *   description: "..."
 *   alwaysApply: false   (we default to false — agent rules are use-case scoped)
 *   globs: []            (optional — omitted here)
 */
export function toMdcFrontmatter(fm, { tag = 'agent' } = {}) {
  const description = normalizeDescription(fm.description, fm.name, tag)
  return {
    description,
    alwaysApply: false,
  }
}

function normalizeDescription(desc, name, tag) {
  const flat = String(desc || '').replace(/\s+/g, ' ').trim()
  const prefix = `[${tag}:${name || 'agent'}]`
  if (!flat) return `${prefix} Role guideline auto-generated from ai-rules.`
  return `${prefix} ${flat}`
}

/**
 * Build a merged "agents" section for single-file tools (Gemini / Copilot).
 * Each agent becomes an `## Agent: {name}` subsection, body text is path-rewritten.
 *
 * @param {Array<{ name: string, frontmatter: object, body: string }>} agents
 * @param {string} tool  target tool key for path rewriting
 * @returns {string}
 */
export function buildMergedAgentsSection(agents, tool) {
  if (!agents?.length) return ''
  const parts = [`## Agents`, '']
  for (const a of agents) {
    const desc = String(a.frontmatter?.description || '').replace(/\s+/g, ' ').trim()
    const tools = Array.isArray(a.frontmatter?.tools)
      ? a.frontmatter.tools.join(', ')
      : (a.frontmatter?.tools || '')
    parts.push(`### Agent: ${a.name}`)
    if (desc) parts.push(`> ${desc}`)
    if (tools) parts.push(`> Allowed tools: ${tools}`)
    parts.push('')
    parts.push(neutralizeClaudeDirectives(rewritePaths(a.body.trim(), tool)))
    parts.push('')
  }
  return parts.join('\n')
}
