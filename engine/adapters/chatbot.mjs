/**
 * chatbot.mjs — Chatbot SOUL.md / AGENTS.md adapter
 * For AI chatbot projects that use SOUL.md + AGENTS.md format.
 * Preserved sections (<!-- ai-rules:keep --> ... <!-- /ai-rules:keep -->) are not overwritten.
 */

import { readFileSync, existsSync } from 'fs'

export function generate(namedBlocks, toolConfig, profile) {
  const files = []

  if (toolConfig.outputs?.soul) {
    files.push({
      path: toolConfig.outputs.soul,
      content: generateSoul(namedBlocks, profile),
      merge: true, // requires preserve tag handling
    })
  }

  if (toolConfig.outputs?.agents) {
    files.push({
      path: toolConfig.outputs.agents,
      content: generateAgents(namedBlocks, profile),
      merge: true,
    })
  }

  return files
}

function generateSoul(namedBlocks, profile) {
  const timestamp = new Date().toISOString()
  const identityBlock = namedBlocks.find(b => b.name === '00-identity')?.content || ''
  const gitBlock = namedBlocks.find(b => b.name === '01-git')?.content || ''

  return [
    `# SOUL.md - Who You Are`,
    `<!-- ai-rules:generated | ${timestamp} | Edit in ai-rules/core/00-identity.md -->`,
    ``,
    `_You're not a chatbot. You're becoming someone._`,
    ``,
    identityBlock,
    ``,
    `## Git Rules (from ai-rules)`,
    ``,
    gitBlock,
  ].join('\n')
}

function generateAgents(namedBlocks, profile) {
  const timestamp = new Date().toISOString()
  const workflowBlock = namedBlocks.find(b => b.name === '04-workflow')?.content || ''
  const sessionBlock = namedBlocks.find(b => b.name === '06-session')?.content || ''
  const heartbeatBlock = namedBlocks.find(b => b.name?.includes('heartbeat'))?.content || ''
  const memoryBlock = namedBlocks.find(b => b.name?.includes('memory'))?.content || ''

  return [
    `# AGENTS.md - Your Workspace`,
    `<!-- ai-rules:generated | ${timestamp} | Edit in ai-rules/ -->`,
    ``,
    `This folder is home. Treat it that way.`,
    ``,
    workflowBlock,
    ``,
    sessionBlock,
    ``,
    heartbeatBlock,
    ``,
    memoryBlock,
  ].join('\n')
}

/**
 * Extract preserved tag ranges from existing file and keep them in new file
 * <!-- ai-rules:keep --> ... <!-- /ai-rules:keep -->
 */
export function mergeWithPreservedSections(targetPath, newContent) {
  if (!existsSync(targetPath)) return newContent

  const existing = readFileSync(targetPath, 'utf-8')
  const keepPattern = /<!-- ai-rules:keep -->([\s\S]*?)<!-- \/ai-rules:keep -->/g
  const preserved = []
  let match

  while ((match = keepPattern.exec(existing)) !== null) {
    preserved.push(match[0])
  }

  if (preserved.length === 0) return newContent

  // Inject preserved sections into new content (append at end)
  return newContent + '\n\n' + preserved.join('\n\n')
}
