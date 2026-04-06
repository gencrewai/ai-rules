# ChatOps Reference

> Written: 2026-04-03
> Purpose: Reference document for integrating `chatbot + messaging platform` operational patterns into the common operating model.

---

## 1. Positioning

`chatbot + messaging platform` is not an optional experimental feature in the common operating model — it is treated as a proven ChatOps reference implementation already in use by MyApp.

This document serves two purposes:

- Incorporate existing MyApp operational patterns into the common model without discarding them
- Provide minimum criteria for other projects to adopt the same approach

---

## 2. Role of ChatOps

ChatOps is not an execution engine but an interaction layer between humans and agents.

Recommended roles:

- Manual invocation
- Status queries
- Approval requests
- Blocker notifications
- Daily / weekly summary delivery

Not recommended roles:

- Source of truth for state
- Sole task log repository
- Solo trigger for large-scale automated correction loops

In short, ChatOps is the interface, and the state ledger must be maintained separately.

---

## 3. Recommended Architecture

```text
Scheduler
  -> Agent execution
  -> State update (`SESSION.md`, `WORKLOG`, `ops/agent-events.jsonl`)
  -> ChatOps delivery (`chatbot + messaging platform`)
  -> Dashboard refresh
```

In this architecture, messenger messages serve as result delivery and approval response channels, while actual operational state is recorded in `ops/` and handoff documents.

---

## 4. Common Patterns

### 4.1 Daily Scrum

- Scheduler wakes the `Leader` or equivalent operational role
- Results are recorded in documents and events
- Summary is sent via messenger

### 4.2 Approval Queue

- When an `approval_needed` event is generated, it is delivered via messenger
- User responds with scope approval or rejection in the messenger
- Approval results are recorded back in the state ledger

### 4.3 Blocker Escalation

- When `task_blocked` persists beyond a certain time, it is escalated via messenger
- When a human returns, they can query detailed reasons through the messenger

---

## 5. Considerations When Porting to Other Projects

### Required

- Does state persist even without the messenger?
- Are approval results recorded back as documents or events?
- Do the scheduler and dashboard continue to function if the messenger goes down?

### Optional

- Per-project summary templates
- Role-based notification routing
- Channel routing by blocker severity

---

## 6. Operating Principles

- ChatOps handles fast interactions
- State is persisted in documents and event ledgers
- Approval policies follow the common `ops/approval-matrix.json`
- Project differences are adjusted through overrides only

---

## 7. Migration Path

Projects already using `chatbot + messaging platform` like MyApp should adopt the common model in this order:

1. Catalog current ChatOps message patterns
2. Identify which messages are recorded back in the state ledger
3. Align core events like `approval_needed`, `task_blocked`, `daily_scrum_completed` to the common schema
4. Move per-project exceptions to `ops/approval-overrides/<project>.json`

In other words, the key to porting is not changing the messenger, but standardizing the state model behind it.

---

## 8. Conclusion

`chatbot + messaging platform` is not a supplementary option to the common operating model — it is a proven ChatOps layer.

However, the criteria for standardization are not ChatOps itself but these three things:

- Where is state recorded?
- Under what policy are approvals interpreted?
- Do the messenger and dashboard read from the same state ledger?
