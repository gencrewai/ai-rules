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
