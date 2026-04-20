# engine/ — Multi-Project, Multi-Tool Sync Engine (Tier 2)

**If you want to deploy the same rules across multiple projects — and across
multiple AI runners per project** — use this tool. It assembles `core/` rules
via profile YAMLs and generates the appropriate output for each project.

Key capabilities at a glance:

- **10+ runners supported** (Claude Code, Codex, Cursor, Windsurf, Gemini,
  Copilot, Cline, Antigravity; Kilo / Augment / Trae / any new tool via the
  generic adapter — see [Adapters](#adapters-supported-tools))
- **Rules + agents** both get shipped per tool, not just rules
- **Manifest-tracked deploy** with SHA256 hashes per file
- **Safe re-sync**: orphan cleanup, user-edit protection, clean uninstall
- **Governance engine** for cross-validating AI-generated code

## Quick Start

```bash
cd ai-rules
npm install

# 1. Create a new project profile (interactive)
npm run new -- my-project

# 2. Generate output to output/<project>/ (preview, no writes to target)
npm run sync

# 3. Apply to the actual project
npm run sync:apply

# 4. Apply + remove files from tools you disabled since last sync
npm run sync:prune

# 5. Remove everything this engine ever wrote to the target
npm run sync:uninstall -- --project my-project

# Target a specific project only
node scripts/sync.mjs --apply --project my-project

# Validate rule composition
npm run validate
```

### CLI Flags (scripts/sync.mjs)

| Flag | Purpose |
|------|---------|
| `--apply` | Copy generated files into each profile's `target_path`. |
| `--project <name>` | Process a single profile only. |
| `--dry-run` | Print what would change; write nothing. |
| `--prune` | During `--apply`, also delete files that were in the previous manifest but are no longer produced (i.e. tools disabled since last run). |
| `--uninstall` | Remove every file listed in the previous manifest. Replaces `--apply` for this run. |
| `--force` | Overwrite files that were edited locally since the last sync, and prune them even when edited. |
| `--verify` / `--skip-verify` | Confirm new sections / new files before writing (on by default). |
| `--yes` | Skip confirmation prompts (for CI). |

## Structure

```
engine/
├── adapters/           # Tool-specific output converters
│   ├── claude-code.mjs #   → CLAUDE.md + .claude/agents/*.md        (native subagents)
│   ├── codex.mjs       #   → AGENTS.md + .codex/agents/*.md         (native subagents)
│   ├── cursor.mjs      #   → .cursor/rules/*.mdc + agents/*.mdc     (role-as-rule)
│   ├── windsurf.mjs    #   → .windsurfrules + .windsurf/rules/agents
│   ├── gemini.mjs      #   → GEMINI.md + .gemini/agents/
│   ├── copilot.mjs     #   → .github/copilot-instructions.md + copilot-agents/
│   ├── cline.mjs       #   → .clinerules + .cline/agents/
│   ├── antigravity.mjs #   → AGENTS.md + .agent/agents/             (Gemini backend)
│   ├── generic.mjs     #   → any tool defined purely in YAML        (Kilo / Augment / Trae / ...)
│   ├── plain.mjs       #   → AI-RULES.md (tool-neutral fallback)
│   ├── chatbot.mjs     #   → SOUL.md + AGENTS.md (chatbot projects)
│   ├── governance.mjs  #   → governance artifacts
│   └── tooling.mjs     #   → commitlint / husky / lint-staged / guard-secrets
│
├── lib/                # Shared helpers
│   ├── agent-transform.mjs #   frontmatter parsing, path rewrites, neutralization
│   ├── manifest.mjs        #   hash / read / diff / prune / uninstall
│   ├── ai-logs.mjs         #   AI log collection setup
│   ├── bootstrap.mjs
│   ├── pipeline-*.mjs      #   orchestrator / gates / state
│   └── scaffold.mjs
│
├── scripts/            # CLI commands
│   ├── sync.mjs        #   rule/agent assembly, apply, prune, uninstall
│   ├── validate.mjs    #   rule integrity validation
│   ├── new.mjs         #   new profile creation
│   └── onboard.mjs     #   existing project onboarding
│
├── governance/         # Cross-validation engine (see below)
├── ops/                # Operational policies
├── templates/          # commitlint / husky / ai-logs templates
├── mcp-server/         # MCP server for AI tool integration
└── docs/               # Detailed engine guides
```

## Adapters (Supported Tools)

### Native subagent runners
| Tool | Rules output | Agents output |
|------|--------------|---------------|
| Claude Code | `CLAUDE.md` | `.claude/agents/{name}.md` (frontmatter + body verbatim) |
| Codex CLI | `AGENTS.md` | `.codex/agents/{name}.md` (frontmatter preserved, paths rewritten) |

### Role-as-rule runners (no native Task-style subagents)
| Tool | Rules output | Agents output |
|------|--------------|---------------|
| Cursor | `.cursor/rules/*.mdc` | `.cursor/rules/agents/{name}.mdc` (`alwaysApply: false`) |
| Windsurf | `.windsurfrules` | `.windsurf/rules/agents/{name}.md` |
| Gemini CLI | `GEMINI.md` | `.gemini/agents/{name}.md` |
| GitHub Copilot | `.github/copilot-instructions.md` | `.github/copilot-agents/{name}.md` + index |
| Cline | `.clinerules` | `.cline/agents/{name}.md` |
| Antigravity | `AGENTS.md` | `.agent/agents/{name}.md` (Gemini-backend path quirks handled) |

### Generic adapter — declare a new tool in YAML, zero adapter code
| Example | Profile declaration |
|---------|---------------------|
| Kilo | `adapter: generic` + `output: .kilo/rules.md` + `path_rewrites: [...]` |
| Augment | `adapter: generic` + `output: .augment/rules.md` |
| Trae | `adapter: generic` + `output: .trae/rules.md` |

See [`examples/profiles/longtail-runners.example.yaml`](../examples/profiles/longtail-runners.example.yaml)
for a full working template.

### Tool-neutral
| Tool | Rules output | Agents output |
|------|--------------|---------------|
| Plain fallback | `AI-RULES.md` | — |
| Chatbot | `SOUL.md` + `AGENTS.md` | — (chatbot-project pattern) |

> **Adding a new tool with format-specific needs**: create
> `adapters/{tool}.mjs` exporting `generate(blocks, toolConfig, profile)`
> and optionally `generateAgents(agents, toolConfig, profile)`, then register
> it in `ADAPTERS` inside `scripts/sync.mjs`. For tools that follow the
> standard "rules file + per-role context" pattern, prefer the generic
> adapter over writing code.

## Profile System

Each project defines its rule composition via a YAML profile under `profiles/`.

```yaml
# profiles/my-project.yaml
project: my-project
target_path: /path/to/my-project

tools:
  claude-code:
    enabled: true
    output: CLAUDE.md
    agents: { enabled: true, output: .claude/agents/ }
  codex:
    enabled: true
    output: AGENTS.md
    agents: { enabled: true, output: .codex/agents/ }
  cursor:
    enabled: true
    output: .cursor/rules/
    agents: { enabled: true, output: .cursor/rules/agents/ }
  # ... windsurf / gemini / copilot / cline / antigravity all follow the same shape

  # Long-tail tool declared inline via the generic adapter:
  kilo:
    adapter: generic
    enabled: true
    output: .kilo/rules.md
    agents: { enabled: true, output: .kilo/agents/ }
    role_heading_prefix: "Kilo Role"
    path_rewrites:
      - { from: "\\bCLAUDE\\.md\\b", to: ".kilo/rules.md" }
      - { from: "\\.claude/agents/",  to: ".kilo/agents/" }

core: [01-git, 02-code, 03-security, 04-workflow]
extensions: [my-backend-rules]

agents:
  enabled: true
  include: [planner, builder, reviewer]
```

Per-tool knobs:

- `tools.<tool>.enabled: false` — skip the tool entirely (rules + agents).
- `tools.<tool>.agents.enabled: false` — keep rules but drop agent files.
- `tools.<tool>.agents.output` — override the default directory.
- `tools.<tool>.adapter: generic` — use the generic adapter even if the tool
  name matches a built-in key (useful for experimentation).
- `tools.<tool>.path_rewrites` — extra `{ from: RegExp, to: string }` rules
  applied on top of the built-in CLAUDE.md/`.claude/` mappings
  (`generic` adapter only).

→ Examples: [`examples/profiles/`](../examples/profiles/)
   — see `multi-tool.example.yaml` and `longtail-runners.example.yaml`.

## Manifest & Safe Re-sync

Every successful `--apply` writes a manifest to
`output/<project>/sync-status.json`:

```json
{
  "version": 2,
  "project": "my-project",
  "target_paths": ["/abs/path/to/my-project"],
  "synced_at": "2026-04-19T...",
  "files": [
    { "path": ".claude/agents/planner.md", "hash": "sha256:...", "tool": "claude-code-agents" },
    { "path": "AGENTS.md",                 "hash": "sha256:...", "tool": "codex" }
  ]
}
```

This manifest powers three guarantees on the next sync:

1. **Orphan detection** — if a tool was disabled since the last run, its
   files appear in the previous manifest but not the new plan. They are
   listed by default; `--prune` deletes them.
2. **User-edit protection** — when a tracked file's current on-disk hash
   differs from the hash recorded in the manifest, the engine assumes the
   user edited it post-sync. Such files are reported and **skipped**
   unless you pass `--force`.
3. **Clean uninstall** — `sync.mjs --uninstall --project X` removes every
   file the manifest claims ownership of (respecting the same edit
   protection unless `--force` is passed).

`v1` flat-list manifests from earlier versions are read transparently; they
just lack hashes, so edit protection is skipped for pre-migration files
(everything written after the upgrade is fully tracked).

## Governance Engine

**Cross-validates** code generated by AI agents.

| Preset | Target | Validation Level |
|--------|--------|------------------|
| `solo` | Solo developer | Basic validation |
| `small-team` | 2-5 person team | Structure + conventions |
| `saas` | Production service | Structure + conventions + domain + security |

## Editing Rules

1. Edit files in `../core/rules/` or under `../extensions/`.
2. `npm run sync` → generate into `output/`.
3. `npm run sync:apply` → apply to projects.

**Never edit `output/` files or a project's CLAUDE.md directly.** They are
regenerated on every sync and your changes will be either lost or flagged
as a user-edit conflict on the next run.
