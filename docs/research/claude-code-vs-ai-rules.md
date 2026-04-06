# Claude Code Official Governance vs ai-rules — Comparative Analysis

> **Date**: 2026-04-06
> **Scope**: [Claude Code official plugins/examples](https://github.com/anthropics/claude-code) (public repo) vs ai-rules (this project)
> **Goal**: Compare governance, safety, and agent control architectures across both systems and identify complementary strengths
> **Related**: Community hook projects analysis — see [community-hooks-analysis.md](community-hooks-analysis.md)

---

## 0. Methodology & Limitations

### What We Examined

- **Claude Code Official**: Public repository clone (anthropics/claude-code). Reviewed `plugins/` (14 plugins), `examples/settings/` (3 configs), `CHANGELOG.md`, plugin READMEs, `hooks.json`, `SKILL.md`, and agent frontmatter. Does **not** include Anthropic's internal source code.
- **ai-rules**: This project's `core/` (11 rule files), `engine/adapters/` (7 adapters), `core/agents/` (9 agents), `engine/governance/` (full directory).

### Important: Different Layers

This document compares **systems that operate at different layers**:

- Claude Code Official = **Platform features** (runtime-enforced blocking, sandbox, permission system)
- ai-rules = **Operational process/policy** (advisory text rules + shell hooks for dual enforcement)

This is not a strict apples-to-apples comparison. "Not found in Claude Code" means "not observed in the public repository" — it does not account for Anthropic's internal roadmap or unreleased features. Similarly, "not found in ai-rules" means "not present in the current implementation."

### Not Independently Verified

- Claude Code runtime's actual sandbox isolation level (analyzed from docs only, no penetration testing)
- `forceRemoteSettingsRefresh` actual fail-closed behavior (documentation-based, not tested under network disconnection)
- Prompt-type hook LLM judgment accuracy and latency impact

---

## 1. Overview

| Aspect | Claude Code (Official) | ai-rules |
|--------|----------------------|----------|
| Nature | Official Anthropic plugins/examples/guides | Multi-tool rule management framework |
| Scale | 14+ plugins, settings examples, skill/agent guides | 11 core rules, 7 adapters, 9 agents, governance engine |
| Target Tools | Claude Code only | Claude Code, Cursor, Windsurf, openclaw, and more (7 tools) |
| Scope | Universal (all users) | Per-project customization via profiles |

---

## 2. Architecture Comparison

### 2.1 Governance Model

| Dimension | Claude Code Official | ai-rules |
|-----------|---------------------|----------|
| **Policy delivery** | `settings.json` hierarchy (managed -> remote -> user -> local) | `CLAUDE.md` text (global -> project) |
| **Enforcement** | **Deterministic** — config-level tool blocking | **Advisory + Hook dual layer** — text rules + shell hooks |
| **Permission model** | `ask/deny/allow/auto/bypass` (5 levels) | `R0/R1/R2` reversibility (3 tiers) |
| **Enterprise** | `managed-settings.json` + `forceRemoteSettingsRefresh` (fail-closed) | Not applicable (designed for individuals/small teams) |

#### ai-rules Strengths

- **Reversibility framework**: R0/R1/R2 tiers are a concept not present in Claude Code. Judging by "can this be undone?" rather than "should this be blocked?" is more practical for real-world decisions
- **Confirmation phrase pattern**: `CONFIRM reset-{db}-{date}` — date inclusion prevents copy-paste reuse. Claude Code has no equivalent friction mechanism

#### Claude Code Strengths

- **Deterministic enforcement**: `permissions.deny: ["WebSearch"]` blocks 100% regardless of AI intent. ai-rules text rules can be ignored under context pressure
- **Bash Sandbox**: Execution isolation and network blocking for the Bash tool specifically. Note: sandbox applies only to the Bash tool — it does not cover Read, Write, WebSearch, WebFetch, MCPs, hooks, or internal commands. ai-rules has no equivalent execution isolation layer
- **Enterprise managed settings hierarchy**: Organization -> remote -> user -> session policy cascade

---

### 2.2 Hook System

| Dimension | Claude Code Official | ai-rules |
|-----------|---------------------|----------|
| **Hook events** | 8+ types (PreToolUse, PostToolUse, Stop, SubagentStop, SessionStart/End, UserPromptSubmit, FileChanged, etc.) | PreToolUse + Pre-commit (Bash matcher focus) |
| **Hook types** | `command` + **`prompt`** (LLM-based judgment) | `command` only (shell script) |
| **Hook output** | Structured JSON (schema varies by event — see note below) | Exit code (0 = pass, 1 = block) |
| **Hook input** | stdin JSON (session_id, transcript_path, tool_name, tool_input, etc.) | `$TOOL_INPUT` environment variable |

**Note on hook output schemas**: Output structure differs by event type. PreToolUse hooks use `hookSpecificOutput.permissionDecision` (`allow/deny/ask`) and optionally `updatedInput` to modify tool input. Stop/SubagentStop hooks use `decision: approve/block`. These are distinct schemas — do not conflate them.

#### Claude Code Strengths

- **`prompt` type hook**: LLM understands context to make judgments — "Is this file modification appropriate?" Shell regex matching cannot achieve semantic verification
- **`updatedInput`** (PreToolUse only): Hooks can modify and return tool input (e.g., redirect a file path to a safe location). ai-rules can only block or pass
- **SessionStart/End, FileChanged, CwdChanged**: Lifecycle hooks not present in ai-rules

#### ai-rules Strengths

- **MUST-HOOK / SHOULD-HOOK / TEXT-ONLY classification** (`09-hooks-guide.md`): Clear criteria for "should this rule be enforced via hook?" Not found in Claude Code's public documentation
- **Advisory -> Deterministic transition criteria** (3 questions): Can cause irreversible damage? / Has been ignored under context pressure? / Must never execute regardless?

---

### 2.3 Agent Patterns

| Dimension | Claude Code Official | ai-rules |
|-----------|---------------------|----------|
| **Agent definition** | `agents/` MD + YAML frontmatter | `agents/` MD + YAML frontmatter (same format) |
| **Permission restriction** | `tools: [Read, Grep, Glob]` | `tools: [Read, Glob, Grep]` (same) |
| **Trigger** | description field + `<example>` blocks for auto-trigger | Manual summoning criteria table |
| **Orchestration** | feature-dev plugin: 7-step workflow + parallel agents | `planner -> builder -> [qa] -> reviewer -> [security]` sequential |
| **Teammate** | Official feature (parallel independent agents) | Pattern documented only (`10-subagent-patterns.md`) |

#### Claude Code Strengths

- **Auto-trigger**: Agent definitions with detailed descriptions and `<example>` blocks appear to enable automatic agent summoning based on user request analysis. The exact mechanism (whether `<example>` blocks are the direct trigger or overall description quality is the primary factor) was not independently verified
- **feature-dev plugin**: Complete orchestration with 7-step workflow + parallel agent execution + user approval gates
- **SubagentStop hook**: Controls subagent completion timing

#### ai-rules Strengths

- **Context Budget guidelines**: Quantitative criteria like "5 files or fewer = main session, 6+ = delegate to subagent." Not found as built-in guidance in Claude Code
- **Per-role model assignment**: reviewer/security use `claude-opus-4-6`, others use default model. Claude Code supports this but lacks explicit guidance

---

## 3. What ai-rules Offers That Claude Code Doesn't

### 3.1 Multi-AI Tool Sync

```
core/ + extensions/ -> adapters/ -> Claude Code, Cursor, Windsurf, openclaw, plain
```

**Deploy the same rule set to 7 AI tools simultaneously.** Claude Code targets only its own tool.

### 3.2 Project Profile System

```yaml
# profiles/my-saas-app.yaml
project: my-saas-app
target_path: ./my-saas-app
tools: [claude-code, cursor, plain]
governance: { preset: saas }
extensions: [custom-agents, custom-ci]
```

Manage multiple projects with different rule combinations via profiles. No equivalent multi-project profile system found in Claude Code's public repo.

### 3.3 Reversibility Framework (R0/R1/R2)

Classify every action along 4 judgment axes:

| Axis | Question |
|------|----------|
| Data loss | Will data disappear after execution? |
| External systems | Does it affect other services/DB/infrastructure? |
| Recovery cost | How much effort to undo? |
| Blast radius | Does the change span more than 1 row/file? |

Claude Code uses a permission/execution-mode model (`ask/deny/allow/auto/bypass`) — these control *whether* a tool runs. ai-rules' R0/R1/R2 operates on a different axis: *how reversible* is the action.

### 3.4 Rule Conflict Resolution

- Explicit priority: security > git > workflow > other
- 4 tie-breaker principles
- Conflict resolution table (8 scenarios)

Claude Code has `managed > remote > user > local` settings hierarchy, but no **semantic conflict resolution** between rules was found in scope.

### 3.5 Session Handoff Protocol

```
---HANDOFF---
date / branch / status / done / next / blocked / failures / first_action
---END---
```

No built-in structured handoff format found in Claude Code. Context injection is possible via SessionStart hooks or plugins, but a standardized protocol for transferring previous agent work status, failures, and decisions (like HANDOFF blocks) is not provided as a built-in feature.

### 3.6 Database Safety Rules (07-db)

- DB name collision prevention (based on real incident)
- Destructive command blocklist table
- Migration execution process standard
- `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` env var guidance

Claude Code's security-guidance plugin covers general security, but DB-specific safety rules (name collisions, migration process) were not found in scope.

---

## 4. What Claude Code Offers That ai-rules Doesn't

### 4.1 Bash Sandbox

```json
{
  "sandbox": {
    "enabled": true,
    "allowUnsandboxedCommands": false,
    "network": {
      "allowedDomains": [],
      "allowLocalBinding": false,
      "allowAllUnixSockets": false
    }
  }
}
```

Execution isolation + network blocking **for the Bash tool only**. The sandbox does not apply to other tools (Read, Write, WebSearch, WebFetch, MCPs), hooks, or internal commands. ai-rules only blocks command patterns via shell hooks.

### 4.2 Prompt-Type Hooks

```json
{
  "type": "prompt",
  "prompt": "Evaluate whether this file modification is security-appropriate: $TOOL_INPUT"
}
```

LLM-based semantic verification. Beyond what shell regex matching can achieve.

### 4.3 Plugin Marketplace

Official marketplace + `strictKnownMarketplaces` for organization-level plugin control. ai-rules uses a centralized management model.

### 4.4 MCP Integration Guide

4 server types (stdio/SSE/HTTP/WebSocket) + `allowedMcpServers`/`deniedMcpServers` policy. ai-rules has an MCP server directory but it is still in early stage.

### 4.5 Hookify (User-Friendly Hook Generation)

```
/hookify Warn me when rm -rf is used
```

Auto-generates hooks from markdown YAML frontmatter. ai-rules hooks require manual shell script authoring.

### 4.6 Structured Hook Output (`updatedInput`)

Hooks can transform and return tool input:

```json
{
  "decision": "approve",
  "updatedInput": { "file_path": "/safe/path/file.txt" },
  "systemMessage": "Path has been redirected to a safe location"
}
```

ai-rules hooks can only block (exit 1) or pass (exit 0).

### 4.7 Enterprise Settings Hierarchy

| Layer | File | Scope |
|-------|------|-------|
| 1. Enterprise Managed | `managed-settings.json` + `managed-settings.d/` | Org policy (cannot override) |
| 2. Remote Sync | `remote-settings.json` | Cloud policy sync |
| 3. User Config | `.claude/settings.json` | Personal settings |
| 4. Session Override | `.claude/settings.local.json` | Temporary settings |

`forceRemoteSettingsRefresh: true` — blocks startup until remote policy is fetched (fail-closed).

---

## 5. Summary Evaluation

| Axis | Claude Code Official | ai-rules |
|------|---------------------|----------|
| **Enforcement** | Deterministic (config blocking) | Advisory + Hook |
| **Flexibility** | Single tool | 7 tools simultaneously |
| **Enterprise** | Managed settings, remote sync, fail-closed | Not applicable |
| **Practical wisdom** | General guidance | Incident-based rules (DB collision, handoff failures, etc.) |
| **Hook sophistication** | Prompt hook, updatedInput, 8+ events | Command hook, 2 events |
| **Agent orchestration** | Auto-trigger, parallel execution | Manual summoning, sequential |
| **Risk judgment** | ask/deny/allow (permission-centric) | R0/R1/R2 (reversibility-centric) |
| **Session continuity** | Not built-in | HANDOFF protocol |
| **Documentation** | Distributed across plugins | Systematic handbook (50+ docs) |

---

## 6. Conclusion

Claude Code's strength is **platform-level enforcement** (sandbox, deterministic hooks, managed settings). ai-rules' strength is **operational-level practical wisdom** (reversibility judgment, session handoff, DB safety, multi-tool sync).

The two systems are **complementary, not competitive**:

```
Claude Code Official = "What can be technically blocked?"     (Platform Layer)
ai-rules             = "What should be blocked, and why?"     (Policy Layer)
```

The ideal setup combines ai-rules' **policy framework** with Claude Code's **platform features** (prompt hooks, sandbox, agent auto-trigger) — achieving a governance system where platform enforcement and operational wisdom reinforce each other.

---

## 7. Roadmap — Planned Improvements

Based on this analysis, the following improvements are planned for ai-rules:

### Immediate (no platform dependency)

| Priority | Item | Details |
|----------|------|---------|
| **P1** | Prompt-type hook guide | Add `prompt` hook section to `09-hooks-guide.md` with example JSON. Claude Code already supports this — only documentation needed |
| **P2** | Agent `<example>` blocks | Add 2-4 `<example>` blocks to each agent definition for Claude Code auto-trigger compatibility |
| **P3** | SessionStart hook | Automate `06-session` Step 0-5 checks (git status, INTENT.md, HANDOFF block) as a SessionStart command hook |

### Platform-dependent (requires Claude Code feature validation)

| Priority | Item | Depends on |
|----------|------|------------|
| **P4** | Sandbox presets | Validate sandbox isolation level, then integrate into `governance/presets/` |
| **P5** | Hookify pattern generation | Wait for hookify plugin YAML spec stabilization |
| **P6** | Hook `updatedInput` support | Requires hook architecture change from exit code to JSON stdout |

### Strengths to Maintain

| Strength | Rationale |
|----------|-----------|
| **Multi-tool sync** | Not a Claude Code-only world. Cursor, Windsurf users need the same rules |
| **R0/R1/R2 reversibility** | More practical than ask/deny binary. "Can it be undone?" > "Should it be blocked?" |
| **Session handoff** | Context preservation for long-running work. Not yet in Claude Code |
| **DB safety rules** | Based on real incidents. Cannot be replaced by generic security plugins |
| **Rule conflict resolution** | More advisory rules = greater need for conflict resolution |
| **Context budget guidelines** | Practical guide for agent efficiency. Not in official docs |
