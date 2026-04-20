# Changelog

All notable changes to `ai-rules` are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
한국어 버전: [CHANGELOG.ko.md](CHANGELOG.ko.md)

## [Unreleased]

> Author: Claude Code (Opus 4.6)
> Approved-by: gencrew
>
> Release date is filled in when this section is promoted to a
> versioned release (e.g. `## [0.2.0] - 2026-04-08`). Until then,
> see git commit metadata for per-change timestamps.

### Added — `scaffold --tools` (single-project multi-tool agents)

- **`scaffold` CLI now accepts `--tools claude-code,codex,cursor`** so the
  single-project quick start can emit agents for all three runners in one
  shot, without having to set up a sync profile first.
- `claude-code` (default) and `codex` paths are handled with pure Node
  built-ins — the zero-install guarantee still holds for them. `cursor`
  lazily loads `js-yaml` via the real Cursor adapter to produce proper
  MDC output; scaffold prints an actionable "run npm install" hint if the
  dep is missing instead of crashing mid-scaffold.
- Rules files for the new tools (`AGENTS.md`, `.cursor/rules/*.mdc`, …)
  and all other runners remain the sync engine's responsibility, keeping
  scaffold focused on the "new repo in 60 seconds" use case.
- Implementation: new `engine/lib/scaffold-agents.mjs` with
  `deployAgentsForTool()` + `parseToolsArg()`; wired into
  `engine/lib/scaffold.mjs` (Step 2.5, now independent of the output-docs
  copy so `--no-docs` still ships agents) and `engine/cli/scaffold.mjs`
  (`-t, --tools` flag, warning path for unknown tools).

### Added — Multi-tool agent deployment (10+ runners)

- **Agents are now shipped to every enabled tool, not just Claude Code.**
  Previously, `sync.mjs` hard-coded agent output to `.claude/agents/{name}.md`.
  It now delegates per-tool via each adapter's new `generateAgents()` export.
- **Seven new adapters** converting `core/agents/*.md` into each tool's native
  layout:
  - `codex` — native agents at `.codex/agents/`, rules at `AGENTS.md`.
  - `cursor` — `.cursor/rules/agents/*.mdc` with `alwaysApply: false`.
  - `windsurf` — `.windsurf/rules/agents/`.
  - `gemini` — `.gemini/agents/` + `GEMINI.md`.
  - `copilot` — `.github/copilot-agents/` + index + `.github/copilot-instructions.md`.
  - `cline` — `.cline/agents/` + `.clinerules`.
  - `antigravity` — `.agent/agents/` + `AGENTS.md` with Gemini-backend path rewrites.
- **`generic` adapter** for long-tail runners declared purely in YAML
  (`adapter: generic` + `output` + `path_rewrites`). Supports Kilo / Augment /
  Trae out of the box via `examples/profiles/longtail-runners.example.yaml`
  and makes future tools addable without any adapter code.
- **Shared `engine/lib/agent-transform.mjs`** with frontmatter parse/stringify,
  per-tool path rewrite tables (`CLAUDE.md` → tool-specific file,
  `.claude/agents/` → tool-specific directory), MDC conversion, and a
  neutralizer that rewrites Claude-only call sites (e.g. "invoke the Task tool"
  → "act in this role") for tools without native subagent runners.
- **Per-tool agent knobs in profile YAML**: each `tools.<tool>` entry now
  accepts `agents: { enabled, output }` for independent opt-in/opt-out and
  output path override.

### Added — Manifest, uninstall, and safe re-sync

- **`engine/lib/manifest.mjs`** — SHA256-hashed file tracking that powers:
  1. **Orphan detection + `--prune`** — files from a previous sync that are
     no longer emitted (e.g. because a tool was disabled) are reported on
     every run and removed when `--prune` is passed.
  2. **User-edit protection** — tracked files whose on-disk hash no longer
     matches the manifest are considered locally modified; they are skipped
     by default and reported, unless `--force` is passed.
  3. **Clean uninstall** — `node engine/scripts/sync.mjs --uninstall --project X`
     deletes every file listed in the previous manifest (still respecting
     edit protection unless `--force` is set).
- **Manifest v2 schema** (`{ version, project, target_paths, synced_at, files: [{ path, hash, tool }] }`)
  replaces the old flat-list `sync-status.json`. v1 manifests are read
  transparently; existing entries just lack hashes until the next full sync.
- **New `npm` scripts**: `sync:prune`, `sync:uninstall`.
- **New CLI flags**: `--prune`, `--uninstall`, `--force`.

### Added — Adapter resolver

- `resolveAdapter(toolName, config)` in `sync.mjs` routes tool entries to
  an adapter by priority:
  1. `config.adapter` (explicit, e.g. `adapter: generic`),
  2. a built-in keyed by tool name (`claude-code`, `codex`, …),
  3. `generic` fallback whenever `output` is provided.
  This lets new tools join the pipeline declaratively without adding a JS
  adapter file as long as they fit the "rules file + per-role context" shape.

### Changed

- **INTENT.md is now an optional anchor** across all core rules.
  Projects without `INTENT.md` no longer trigger rule violations or
  bootstrap warnings. Affected files: `02-code`, `04-workflow`,
  `05-responses`, `06-session`, `08-ui-first`. Rules now reference
  INTENT.md as "if the project uses one" rather than as a required
  artifact, eliminating the cascade where one schema change forced
  edits across 6+ files.

- **`04-workflow` and `06-session` cleanly split by role.**
  `04-workflow` owns work-flow concerns (modes, gates, plan mode,
  WORKLOG cadence, failure protocol, decision log). `06-session`
  owns session-boundary concerns (start steps, HANDOFF block,
  context-limit trigger, ACTIVE_WORK update). Duplicate definitions
  of context-limit trigger, WORKLOG cadence, and session-start
  anchor order have been removed — each lives in exactly one file
  now, with one-line pointers from the other side.

### Reduced

- **`SESSION.md` HANDOFF block reduced from ~10 fields to 3 required
  + 3 optional.**
  - Required: `status`, `next`, `blocked`
  - Optional: `done`, `failures`, `handoff_provenance`
  - Dropped: `date`, `branch`, `agent`, `files_touched`, `verify_cmd`,
    `first_action` — git already provides these.

  Existing `SESSION.md` files remain readable; new sessions write
  the slimmer schema. The `03-security` R2 audit trail still uses
  the optional `done` field, documented inline in `06-session`.

### Fixed

- `engine/scripts/validate.mjs` updated to match the current
  `core/rules/` + `examples/profiles/` layout. The script previously
  pointed at the pre-refactor `engine/core/` + `engine/profiles/`
  paths and crashed on missing directories. Optional directories
  (`extensions/`, `agents/`, `output/`) now skip gracefully when
  absent instead of throwing.

### Background

The L1–L3 refactor was motivated by the cascade pattern observed in
recent commits, where small fixes required edits across 4–5 files.
See [`docs/research/rule-coupling-diagnosis.md`](docs/research/rule-coupling-diagnosis.md)
for the rule-coupling analysis (reference graph, shared-artifact
fan-out, leverage point ranking).

### Migration Notes for Sync Consumers

- **No action required** for projects that use `INTENT.md` — behavior
  is unchanged when the file is present.
- **No action required** for existing `SESSION.md` files — old fields
  are ignored, not rejected.
- Projects that rely on automated parsing of HANDOFF fields should
  treat `date`/`branch`/`agent`/`files_touched`/`verify_cmd`/`first_action`
  as no longer guaranteed and read them from git instead.
