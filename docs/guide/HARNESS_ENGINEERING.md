# Harness Engineering

> Date: 2026-04-01  
> Purpose: A common guide for evolving `ai-rules` from a "collection of rule documents" into a "system that actually enforces policies"

---

## 1. Why This Is Needed

Rules explain principles to agents, but they cannot enforce behavior on their own. To reduce risky actions, an execution harness must exist alongside document-based policies.

Key distinction:

- `Policy`: Describes what should be done and what is forbidden
- `Harness`: Performs blocking, approval, verification, and logging to ensure policies are actually followed

One-line summary:

> Policy tells. Harness blocks.

---

## 2. Current System Strengths

`ai-rules` already has some harness characteristics.

- Centrally manages policies through `core/`, `extensions/`, `profiles/`, `adapters/`
- Deploys identical policies to multiple tools via `scripts/sync.mjs`
- Generates consistent output per project
- Auto-generates `.ai-governance/` settings through the governance adapter

In other words, the current structure is closer to a `policy distribution system` than a simple document repository.

---

## 3. Harness Gaps

Currently, "distributing policies well" is strong, but "actually blocking risky execution" is weak.

Key gaps:

- No sync supply chain verification
- Lack of intent-based judgment for forbidden pattern bypasses
- Provenance trust issues with `SESSION.md` handoff
- Rule conflict resolution depends on distributed documents
- Insufficient decision rationale tracing after incidents
- Approval requests may end with a perfunctory click

---

## 4. Where Harness Should Be Added

### 4.1 Sync Stage

Purpose: Prevent rule supply chain contamination

Candidate additions:

- Display pre/post-generation diff
- Show source for new blocks / sections / extensions
- Warn on headers or block IDs outside allowlist
- Require user confirmation before `--apply`

### 4.2 Session Start

Purpose: Prevent uncritical trust in handoff information

Candidate additions:

- Treat `SESSION.md next` as reference information only
- Re-verify current state for high-risk next items like `push`, `deploy`, `DB changes`
- Introduce provenance fields like `handoff_provenance`

### 4.3 Pre-Command Execution

Purpose: Determine risk by task effect, not pattern

Candidate additions:

- Reversibility check
- Evaluate impact scope, data loss potential, external state change
- Switch to human approval or human direct execution for high-risk items

### 4.4 Approval Request

Purpose: Prevent approval fatigue

Candidate additions:

- Typed confirmation instead of simple "yes"
- Use re-entry phrases that include task details
- Apply tiered approval intensity

### 4.5 Session End

Purpose: Accumulate audit trail

Candidate additions:

- Why this approach was chosen
- What alternatives were considered
- Which rules were applied
- What remaining risks exist

---

## 5. Role Division Between Policy and Harness

### What belongs in documents

- Priorities
- Forbidden/allowed principles
- Approval criteria
- Conflict matrices

### What belongs in manifests or structured data

- Action taxonomy
- Risk tier
- Approval mode
- Never-override list

### What belongs in code harness

- Diff gate
- Preflight risk check
- Typed confirmation
- Handoff re-verification
- Automatic audit log recording

---

## 6. Design Principles

- Keep core rules short and strong
- Separate lengthy explanations and examples into handbooks
- Use pattern bans only for fast detection
- Perform final judgment based on reversibility and impact scope
- Treat handoff as a reference hint, not a basis for trust
- Block high-risk tasks with "procedures," not "explanations"

---

## 7. Incremental Adoption Order

Priority by impact:

1. Rule conflict matrix
2. Reversibility principles
3. High-risk approval friction
4. Sync diff gate
5. Optional decision logging
6. Handoff provenance reinforcement

---

## 8. Conclusion

The next step for `ai-rules` is not writing more rules, but promoting important rules to harness. Documents explain policies, and harness must make those policies actually work.
