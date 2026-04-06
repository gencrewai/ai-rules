/**
 * plain.mjs — Tool-neutral AI-RULES.md generation adapter
 * Plain markdown readable by any AI editor
 * Fallback for future tool support
 */

export function generate(blocks, toolConfig, profile) {
  const timestamp = new Date().toISOString()
  const header = [
    `# AI-RULES.md — AI Agent Rules`,
    ``,
    `> This file is auto-generated from [ai-rules](https://github.com/gencrewai/ai-rules).`,
    `> Edit rules in \`ai-rules/core/\` or \`ai-rules/extensions/\`, not here.`,
    `> Last sync: ${timestamp} | Profile: ${profile.project}`,
    ``,
    `---`,
    ``,
    `## How to use this file`,
    ``,
    `If you are an AI coding assistant (Cursor, Windsurf, GitHub Copilot, etc.):`,
    `- Treat all rules in this file as mandatory unless explicitly overridden`,
    `- Rules marked CRITICAL or Hard Ban are non-negotiable`,
    `- When in doubt, ask the user before taking action`,
    ``,
    `---`,
    ``,
  ].join('\n')

  return [{
    path: toolConfig.output,
    content: header + blocks.join('\n\n---\n\n'),
  }]
}
