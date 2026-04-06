# Agent Operating Model

> Date: 2026-04-03  
> Purpose: Define an agent team operating model that can be commonly applied across multiple repositories, not tied to a specific project

---

## 1. Goal

This document is based on "agents working as a team" rather than "using agents as tools."

Four core objectives:

- Automate repetitive work
- Reduce approval fatigue
- Preserve human judgment for risky changes
- Structure state, handoff, and verification

---

## 2. Fundamental Principles

Agent operations follow these principles:

- The source of truth is state data, not conversation
- Verification must be designed before implementation
- Every task must have a role and exit criteria
- Every session must leave a handoff
- Human approval is obtained per scope, not per action

---

## 3. Operating Layers

The overall structure is divided into 4 layers.

### 3.1 State Plane

The structured state and records layer that agents leave behind.

Recommended assets:

- `SESSION.md`
- `WORKLOG/`
- `ACTIVE_WORK.md`
- `ops/agent-events.jsonl`
- `ops/approval-matrix.json`
- `ops/approval-overrides/<project>.json`

Among these, documents are easy for humans to read, while JSONL is easy for dashboards and automation to read.

### 3.2 Execution Plane

The execution layer that actually triggers agents.

Recommended combinations:

- `Claude GitHub Actions`: Shared team scheduled tasks
- `Claude Desktop scheduled task`: Personal auxiliary tasks requiring local file access
- `my-chatbot + messaging platform`: Notifications, Q&A, approvals, manual invocation
- Direct conversation sessions: Complex implementation and exception handling

`my-chatbot + messaging platform` is not a hobbyist option — it treats the ChatOps layer already in production at `MyApp` as the reference implementation for a common operating model. In other words, it is not something to invent from scratch but a reference other projects can adopt.

### 3.3 Analysis Plane

The layer where role-based agents read state and make judgments.

Recommended roles:

- `Leader`
- `Planner`
- `Builder`
- `Reviewer`
- `QA`
- `Security`
- `Release Lead`

### 3.4 Visibility Plane

The layer where humans view the current state.

Recommended assets:

- Dashboard
- Telegram / Slack / Discord notifications
- Daily / weekly reports

The dashboard is not the core — it is an observation layer. The core is the State Plane.

---

## 4. Role Model

### Leader

- Generate daily scrums
- Escalate blockers
- Clear approval-pending queues
- Suggest sprint priorities

Currently, `Leader` may not exist as a separate base agent in `ai-rules`' default agent list. In the initial adoption stage, treat `Leader` as an operational role combining `planner + orchestrator` rather than an independent agent.

### Planner

- Organize task intent
- Decompose scope
- Assist approval level determination
- Suggest next tasks

### Builder

- Code implementation
- Document edits
- Test writing
- Bug fixes with clear scope

### Reviewer

- Identify change risks
- Review quality, regressions, and scope drift
- Determine need for additional tests

### QA

- Execute tests
- Verify regressions
- Validate reproduction scenarios

### Security

- Inspect authentication, authorization, payment, and sensitive data changes
- Conduct STRIDE-based risk checks

### Release Lead

- Determine if changes are deployable
- Organize unresolved risks and rollback points

Currently, `Release Lead` is also more realistic as an operational role that synthesizes `qa + security + reviewer` results rather than a separate base agent. Whether to promote it to a formal agent should be decided after operations stabilize.

---

## 5. Approval Model

Approvals must be managed per scope, not per task.

### P0 Auto

Execute without human approval.

Examples:

- State collection
- Summary generation
- Document reading
- Report writing
- Test and lint execution

### P1 Scoped Auto

Auto-modify within pre-approved scope, then report after completion.

Note: This level does not mean "auto-allow any implementation." It applies only to follow-up execution where scope was already confirmed by a human or at a prior planning stage.

Examples:

- `docs/**`
- `tests/**`
- Clear small bug fixes
- lint / format fixes

### P2 Batch Approval

Approve at a grouping level (branch, ticket, sprint), then auto-execute.

Examples:

- Specific feature branch scope
- This week's flaky test fix batch
- Documentation system cleanup work

### P3 Explicit Approval

Always requires explicit human approval.

Examples:

- DB schema changes
- Authentication, authorization, payment changes
- Dependency addition / removal
- API breaking changes
- Push, PR, deploy
- External system state changes

---

## 6. Common Approval Matrix

The following principles apply by default:

- `observe` is `P0`
- `small edit` is `P1`
- `feature batch` is `P2`
- `critical change` and `ship` are `P3`

Recommended policy example:

```json
{
  "default": {
    "observe": "P0",
    "docs_edit": "P1",
    "small_code_fix": "P1",
    "feature_batch": "P2",
    "dependency_change": "P3",
    "auth_change": "P3",
    "db_change": "P3",
    "push_pr_deploy": "P3"
  }
}
```

Project-specific differences should be handled through overrides only, while the base framework remains common.

### Mapping to Existing Core Rules

This document does not replace `core/` rules. The interpretation order always follows existing higher-priority rules.

- Security, auth, payment, authorization, DB, and deploy are governed by existing security / git / workflow rules first
- `P1` applies only to low-risk follow-up execution within already-approved scope
- If an implementation request itself is ambiguous or broad in scope, the Plan or design stage comes first per existing workflow rules
- `P2` is a batch execution model after receiving human approval at the ticket/branch/sprint level
- `P3` corresponds to the strong approval zones in existing rules: approval required, protected branch, deploy, external side effect

In short, `P0–P3` is the common operational language, while actual enforcement is handled by existing `core/` rules and harness.

---

## 7. Workflows

### 7.1 Daily Scrum

1. Scheduler wakes `Leader`.
2. Reads `SESSION.md`, `WORKLOG`, and recent events.
3. Summarizes yesterday's work, today's plan, blockers, and items needing approval.
4. Reflects the report to dashboard and messenger channels.

### 7.2 Build Flow

1. `Planner` organizes work scope and exit criteria.
2. Determines approval level.
3. `Builder` implements.
4. `Reviewer` and `QA` verify.
5. If security-related, `Security` conducts additional review.
6. If a deploy candidate, `Release Lead` organizes readiness.

### 7.3 Blocked Flow

1. `Builder` or `QA` logs a `task_blocked` event.
2. If it persists beyond a threshold, `Leader` escalates.
3. If human judgment is needed, creates `approval_needed`.
4. Exposes approval-pending status in messenger and dashboard.

---

## 8. Event Model

Document-based handoff alone makes dashboards and automation weak. Therefore, maintaining an event ledger alongside is recommended.

Recommended event examples:

- `task_created`
- `task_started`
- `task_completed`
- `task_blocked`
- `approval_needed`
- `approval_granted`
- `review_requested`
- `review_completed`
- `qa_passed`
- `qa_failed`
- `security_required`
- `release_ready`

Example:

```json
{"ts":"2026-04-03T08:55:00Z","project":"ai-rules","agent":"leader","event":"daily_scrum_started"}
{"ts":"2026-04-03T09:02:10Z","project":"ai-rules","agent":"builder","event":"task_blocked","reason":"approval_needed"}
{"ts":"2026-04-03T09:03:00Z","project":"ai-rules","agent":"leader","event":"approval_needed","scope":"feature_batch"}
```

---

## 9. Dashboard Role

The dashboard is not "the engine running agents" but "a control panel showing current state."

Minimum items to display on dashboard:

- Currently running agents
- Blocked tasks
- Approval queue
- Recent handoffs
- Branch status
- Today's completed / in-progress / delayed
- Release readiness

Recommended principles:

- Dashboard should read structured events, not infer state
- Start with polling, expand to websocket when needed
- Reports and messenger notifications are auxiliary outputs of the dashboard

---

## 10. Scheduler Selection Criteria

### Claude GitHub Actions

Suitable for:

- Shared team scheduled tasks
- Daily / weekly reports
- Release readiness analysis
- PR, branch, issue-based automation

Strengths:

- High durability
- Logs and history are retained
- Well-suited for repository-centric operations

### Claude Desktop scheduled task

Suitable for:

- Auxiliary tasks requiring local file access
- Personal workspace state collection
- Personal automation when PC is on

Strengths:

- Strong local context awareness
- Easy to integrate with personal work habits

### my-chatbot + messaging platform

Suitable for:

- Manual invocation
- Q&A
- Approval requests
- Summary review

Strengths:

- Fast human-agent interaction
- Can reuse the pattern already in production at `MyApp` as a reference implementation

Recommended conclusion:

- Scheduled execution: `Claude GitHub Actions` or `Claude Desktop scheduled task`
- Invocation and notifications: `my-chatbot + messaging platform`
- Viewing: Dashboard

When porting operations, the recommended approach is to connect `MyApp`'s ChatOps configuration on top of a common state ledger and approval policy, rather than directly cloning it.

---

## 11. Metrics

Agent operations must not be evaluated by gut feeling.

Minimum metrics:

- Agent-created PR count
- Merge rate
- CI first-pass rate
- Average blocker dwell time
- Human approval wait time
- Retry count
- Release readiness warning count

These metrics measure "whether there was verifiable improvement in speed and quality," not "whether AI was used a lot."

---

## 12. Adoption Order

### Phase 1

- Establish `SESSION.md`, `WORKLOG`, `ACTIVE_WORK`
- Automate `daily scrum`
- Finalize `P0` / `P1` / `P3` approval criteria
- For projects already running `my-chatbot + messaging platform`, document that configuration as reference

### Phase 2

- Introduce `ops/agent-events.jsonl`
- Add `Reviewer`, `QA`, `Security` gates
- Add approval queue
- Generate minimal `ops/` scaffold

### Phase 3

- Connect dashboard
- Add `Release Lead`
- Add project override policies

### Phase 4

- Failure-based auto-triggers
- Refine messenger approval flow
- Introduce websocket or richer viewer

---

## 13. Conclusion

A good agent operating model is neither "always auto" nor "always approve."

The best structure is:

- State is left in structured form
- Scheduled execution is handled by durable schedulers
- Human approval is grouped by scope
- Implementation and verification roles are separated
- Dashboard is the layer that shows results

In other words, to build an agent culture, you need an operating model before you need a viewer.

---

## 14. Migration Path

If a specific project is already using some operating layers, do not discard them — incorporate them into the common model.

Examples:

- `MyApp`'s `my-chatbot + messaging platform` is used as a reference implementation for the invocation/notification/approval channel
- Other projects follow the same pattern, but share common `ops/` model for state recording and approval criteria
- Project-specific rules are limited to `approval-overrides` and project-specific guides

In other words, the goal of commonization is not to make every project identical, but to have them operate on the same operational language and the same approval model.
