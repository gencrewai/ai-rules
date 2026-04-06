#!/usr/bin/env node
/**
 * ai-rules MCP Server
 *
 * Tools:
 *   scaffold_project — Scaffold a new project with ai-rules (rules + agents + Git init)
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
  'Scaffold a new project with ai-rules. Composes rules into CLAUDE.md, copies agents, generates stack-specific config, and initializes Git',
  {
    name: z.string().describe('Project name (kebab-case, e.g., my-app)'),
    dev_root: z.string().describe('Directory where the project will be created (absolute path, e.g., /home/user/projects or D:\\dev)'),
    stack: z.string().default('react-fastapi-postgres').describe('Preset stack (react-fastapi-postgres, next-fastapi-postgres, react-express-postgres, react-express-mongodb, next-none-none)'),
    copy_output_docs: z.boolean().default(true).describe('Whether to copy ai-rules/output/{name}/ docs to project'),
    git_init: z.boolean().default(true).describe('Whether to perform Git init + first commit'),
    starter_kit_root: z.string().optional().describe('Optional. External starter kit path. If omitted, uses built-in bootstrap'),
  },
  async ({ name, dev_root, stack, copy_output_docs, git_init, starter_kit_root }) => {
    const result = await scaffoldProject({
      name,
      stack,
      copyOutputDocs: copy_output_docs,
      gitInit: git_init,
      paths: {
        devRoot: dev_root,
        starterKitRoot: starter_kit_root || null,
      },
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
