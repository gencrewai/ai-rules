#!/usr/bin/env node
/**
 * ai-rules MCP Server
 *
 * Tools:
 *   scaffold_project — Scaffold a new project from starter kit + document copy + Git init
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { scaffoldProject } from '../lib/scaffold.mjs'

// ── MCP Server ──────────────────────────────────────────────────────────
const server = new McpServer({
  name: 'ai-rules',
  version: '1.0.0',
})

// ── Tool: scaffold_project ────────────────────────────────────────────
server.tool(
  'scaffold_project',
  'Scaffold a new project from starter kit. Runs init-project.mjs + copies ai-rules docs + Git init in one step',
  {
    name: z.string().describe('Project name (kebab-case, e.g., prompt-store)'),
    stack: z.string().default('react-fastapi-postgres').describe('Preset stack (react-fastapi-postgres, next-fastapi-postgres, etc.)'),
    copy_output_docs: z.boolean().default(true).describe('Whether to copy ai-rules/output/{name}/ docs to project'),
    git_init: z.boolean().default(true).describe('Whether to perform Git init + first commit'),
  },
  async ({ name, stack, copy_output_docs, git_init }) => {
    const result = await scaffoldProject({
      name,
      stack,
      copyOutputDocs: copy_output_docs,
      gitInit: git_init,
    })
    return {
      content: [{ type: 'text', text: result.log.join('\n') }],
      isError: result.isError,
    }
  }
)

// ── Server Start ─────────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
