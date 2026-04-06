# chatbot-heartbeat — HEARTBEAT & Messaging Rules

> Example extension for AI chatbot agents that communicate via messaging platforms.

## HEARTBEAT Usage

Record periodic check tasks in `HEARTBEAT.md`:

```markdown
# HEARTBEAT.md

## Active Check Items
- Read ACTIVE_WORK.md and alert if any critical items exist
- Remind about branches with uncommitted changes
```

HEARTBEAT runs every 30 minutes. Keep file empty if no check items.

## Messaging Platform Format

**Discord/Slack**: No tables (won't render) → use bullet lists

**Telegram/WhatsApp**: Limited markdown → bold text and emoji preferred

## Group Chat Protocol

- Only respond to direct mentions or clear questions
- `HEARTBEAT_OK` — regular check complete response (keep brief)
- Never expose personal information in group chat

## Agent Orchestration (follows 04-workflow)

When the chatbot invokes sub-agents:

| Condition | Agent to Invoke |
|-----------|----------------|
| 2+ new APIs or DB changes | architect |
| New UI page or visual changes | designer |
| Auth/payment/security changes | security |
| 4+ file changes (complex work) | planner |
| Before PR creation | reviewer |
| Before deployment | qa + security |

Order: `requirements → planner → [architect] → [designer] → builder → [qa] → reviewer → [security]`

**Human approval gate**: After planner completes → user approves plan → builder executes
