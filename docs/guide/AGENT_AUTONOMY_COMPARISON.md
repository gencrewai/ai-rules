# Agent Autonomy Comparison — AI Coding Agent Autonomy Models

> Date: 2026-04-03
> Purpose: Compare the autonomy models of major AI coding agents and identify where ai-rules' 04-workflow mode system fits

---

## 1. Industry Autonomy Patterns Summary

The industry broadly falls into **2 patterns**.

| Pattern | Representative Agents | Characteristics |
|---------|----------------------|-----------------|
| **File/Terminal approval axis** | Claude Code, Cursor, Codex CLI, Windsurf | Controls only code edit and terminal command approval. Commit/push/deploy are outside agent scope |
| **Full autonomy + PR gate** | Copilot Agent, Devin, Jules | Agent works freely. PR is the only approval gate |

ai-rules' 04-workflow is a **3rd pattern** that **controls commit/push/PR/deploy as independent axes**. This approach is a unique design not found in other agents.

---

## 2. Detailed Per-Agent Comparison

### 2.1 Anthropic Claude Code

6 official modes (cycle with Shift+Tab):

| Mode | File edits | Terminal commands | Notes |
|------|-----------|-------------------|-------|
| **default** | Approval required | Approval required | Default |
| **acceptEdits** | Auto | Approval required | |
| **plan** | Forbidden | Exploration only | Research + planning only |
| **auto** | AI classifier decides | Classifier decides | Released 2026.03 |
| **dontAsk** | Auto | Auto | |
| **bypassPermissions** | All auto | All auto | |

**Auto Mode key feature**: 2-layer defense — (1) prompt injection detection, (2) Sonnet 4.6-based transcript classifier evaluates each action before execution. Auto-stops after 3 consecutive rejections or 20 total rejections + escalates to human.

**Commit/push/deploy**: Claude Code itself has no built-in git workflow automation. Users define it through CLAUDE.md + hooks.

---

### 2.2 GitHub Copilot Coding Agent

Single asynchronous autonomous mode. No discrete mode distinctions.

| Item | Behavior |
|------|----------|
| Branch | Auto-created (`copilot/*` pattern only) |
| Commit | Auto (auto commit+push during work) |
| PR | Auto-created (draft PR) |
| Merge | Forbidden — human must review+approve+merge |
| CI/CD | Cannot run without human approval |

Controls: Behavior rules defined via `AGENTS.md` / `.github/copilot-instructions.md`. Firewall restricts network access.

Core philosophy: **"Autonomous execution + PR gate"** — agent works freely, but all output must go through human review via PR.

---

### 2.3 Cursor

3 levels:

| Mode | File edits | Terminal commands | File deletion |
|------|-----------|-------------------|---------------|
| **Normal (Agent)** | Applied after diff review | Preview then approve | Approval required |
| **YOLO Mode** | Auto-applied | Auto-executed | Auto |
| **Plan Mode** | Plan only | — | — |

YOLO Mode: `allowedCommands` lets you configure auto-approved command patterns. Automatic checkpoint creation enables full rollback.

Commit/push: No built-in auto commit/push.

---

### 2.4 Devin (Cognition)

Single "fully autonomous" mode. No mode distinctions.

| Item | Behavior |
|------|----------|
| Environment | Isolated cloud VM (terminal+editor+browser) |
| Planning | Auto-generated, user can edit/reorder/approve |
| Code writing | Fully autonomous |
| Testing | Auto-executed |
| Commit | Auto |
| PR | Auto-created (no direct push to main) |
| Review response | Auto-responds to and incorporates human PR comments |

Key: Can be left unattended after task assignment. PR review is the only approval gate.

---

### 2.5 OpenAI Codex CLI

3 levels (the most clearly discrete modes):

| Mode | File read | File edit | Command execution |
|------|----------|-----------|-------------------|
| **suggest** (default) | Auto | Approval required | Approval required |
| **auto-edit** | Auto | Auto | Approval required |
| **full-auto** | Auto | Auto | Auto (sandboxed) |

Configured via CLI flags or `config.toml`. full-auto runs in a network-disabled sandbox environment.

Commit/push: No built-in auto commit/push. Autonomy extends only to code edits.

---

### 2.6 Windsurf (Codeium Cascade)

4 levels of terminal command auto-execution:

| Level | Description |
|-------|-------------|
| **Disabled** | All terminal commands require approval |
| **Allowlist Only** | Only allowlisted commands auto-execute |
| **Auto** | All commands auto-execute except deny-list |
| **Turbo** | All commands auto-execute except deny-list (admin permission required) |

Enterprise: Admins can set the maximum allowed auto-execution level for the organization. `.codeiumignore` restricts file access.

Commit/push: No built-in auto commit/push.

---

### 2.7 Amazon Q Developer

2 levels:

| Mode | Description |
|------|-------------|
| **Automated** | Auto-applies code edits |
| **Step-by-step** | Review+confirm at each step before applying |

Commit/push: Agent does not commit/push directly. Suggests code patches for user acceptance. Auto-creates PR for async work from GitHub issues.

---

### 2.8 Google Jules

Single asynchronous autonomous mode (similar to Devin):

| Item | Behavior |
|------|----------|
| Environment | Clones repo and works in a secure VM |
| Planning | Auto-generated, user can verify/modify each step |
| Commit | Auto (3 authorship modes: Jules only / Co-authored / User only) |
| PR | Auto-created (includes diff + rationale) |
| CI failure | Auto-detect → fix → re-commit → re-submit loop |

Key: Asynchronous design. Plan-stage approval is the only gate.

---

## 3. Comprehensive Comparison Table

| Agent | # Modes | Default Autonomy | Auto Commit | Auto PR | Primary Safeguards |
|-------|---------|-------------------|-------------|---------|-------------------|
| **Claude Code** | 6 | default (approval required) | X | X | AI classifier, hooks, CLAUDE.md |
| **Copilot Agent** | 1 | Fully autonomous | O | O (draft) | Branch restriction, PR review required |
| **Cursor** | 3 | Agent (semi-autonomous) | X | X | diff review, checkpoint |
| **Devin** | 1 | Fully autonomous | O | O | PR review, Interactive Planning |
| **Codex CLI** | 3 | suggest (minimal) | X | X | Sandbox, granular policy |
| **Windsurf** | 4 | Auto (semi-autonomous) | X | X | deny-list, admin policy |
| **Amazon Q** | 2 | Step-by-step | X | X | Patch acceptance gate |
| **Google Jules** | 1 | Fully autonomous | O | O | Plan approval, authorship control |

---

## 4. Comparison with ai-rules 04-workflow Modes

### ai-rules Agent Work Modes (6 levels)

| Mode | Commit | Push | PR | Deploy | AskUserQuestion |
|------|--------|------|----|--------|----------------|
| `manual` | Auto | Blocked | Blocked | Blocked | Enabled |
| `auto` | Auto | Auto | Auto | Blocked | Enabled |
| `auto-push` | Auto | Auto | Auto | →develop | Minimized (default) |
| `staging` | Auto | Auto | →develop | staging | Minimized |
| `production` | Auto | Auto | →main | production | Minimized |
| `idle` | Auto | Auto | →develop | staging | Forbidden |

### Unique Design Points

| Feature | ai-rules | Industry Norm |
|---------|----------|---------------|
| **Control axes** | Commit/Push/PR/Deploy controlled independently | Only file edit/terminal command approval |
| **Deploy integration** | Deploy scope included in mode (develop/staging/production) | Deploy is outside agent scope |
| **Conversation control** | AskUserQuestion level varies by mode | No conversation frequency control |
| **idle mode** | No questions to human, autonomous judgment, auto-terminate after 3 failures | No equivalent concept |
| **Mode switching** | Natural language commands | Settings UI or CLI flags |

### Why This Architecture

1. **Claude Code's official modes only control "code edit approval."** Git workflow policies like commit/push/deploy are delegated to CLAUDE.md + hooks. ai-rules' mode system fills this gap.

2. **Copilot Agent/Devin/Jules use a single "full autonomy + PR gate" mode.** This is safe because PR review is always required, but it cannot adjust deploy scope or conversation frequency per situation.

3. **ai-rules granularly switches autonomy levels based on context.** `auto` for exploration, `auto-push` for focused implementation, `staging`/`production` for deploy-inclusive work, `idle` for overnight autonomous work — this kind of contextual switching is not found in other agents.

---

## 5. Lessons from Industry Trends

| Agent | Pattern to Reference | Applicability |
|-------|---------------------|---------------|
| **Copilot Agent** | `copilot/*` dedicated branch pattern for agent work isolation | Can be used for parallel agent isolation |
| **Claude Code auto** | AI classifier pre-evaluates each tool call | Reference for hooks + classifier dual defense |
| **Jules** | 3 authorship modes (Jules only / Co-authored / User only) | Can extend Co-Authored-By rules |
| **Codex CLI** | full-auto execution in network-disabled sandbox | Reference for strengthening idle mode safeguards |
| **Windsurf** | Enterprise admin sets maximum allowed autonomy | Idea for team-level mode caps |
| **Devin** | CI failure auto-detect → fix → re-submit loop | Reference for QA agent auto-retry patterns |

---

## 6. Sources

- [Claude Code Auto Mode — Anthropic Engineering](https://www.anthropic.com/engineering/claude-code-auto-mode)
- [Choose a permission mode — Claude Code Docs](https://code.claude.com/docs/en/permission-modes)
- [About GitHub Copilot coding agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)
- [Cursor Modes Documentation](https://docs.cursor.com/agent/modes)
- [Devin AI Guide 2026](https://aitoolsdevpro.com/ai-tools/devin-guide/)
- [Codex CLI Features — OpenAI](https://developers.openai.com/codex/cli/features)
- [Windsurf Cascade Documentation](https://docs.windsurf.com/windsurf/cascade/cascade)
- [Amazon Q Developer Agentic Coding](https://aws.amazon.com/blogs/aws/amazon-q-developer-elevates-the-ide-experience-with-new-agentic-coding-experience/)
- [Google Jules Official Site](https://jules.google)
