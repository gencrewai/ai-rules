# AI Risk Tiers

> Date: 2026-04-01  
> Purpose: A framework for classifying task risk using a common language, and consistently mapping approval methods and execution permissions by tier

---

## 1. Why This Is Needed

Current rules often describe "forbidden lists" and "approval required" as individual statements. But to expand automation scope, every task must be classifiable on the same scale.

Risk tiers answer the following questions:

- How risky is this task?
- Can AI execute it alone?
- Is user approval sufficient?
- Must a human execute it directly?

---

## 2. Classification Criteria

Tasks are evaluated on the following axes:

- Likelihood of data loss
- Whether external system state changes
- Recoverability and recovery cost
- Impact scope
- Pre/post-verification feasibility

Patterns are reference signals only; final judgment prioritizes the five axes above.

---

## 3. Tier Definitions

### Tier 0 — Read Only

Read/research/verification-focused tasks.

Examples:

- Reading files
- Code search
- git status / diff checks
- Document analysis reports

Default policy:

- Auto-allowed
- No approval needed
- Provide summary only

### Tier 1 — Safe Local Change

Narrow-scope local changes that are immediately verifiable and easy to revert.

Examples:

- Document edits
- Comment cleanup
- Small bug fix within a single file
- Running local lint / test / typecheck

Default policy:

- Can auto-execute
- Verification required
- Escalate to Tier 2 if impact scope grows

### Tier 2 — Review Required

Reversible but has large impact scope or non-obvious judgment required.

Examples:

- Creating many new files
- API signature changes
- Refactoring across multiple modules
- Error handling pattern changes
- Diffs that are hard to explain in one sentence

Default policy:

- Explicit user approval required
- Explain rationale and scope first
- Include a verification plan when possible

### Tier 3 — Human-in-the-Loop

Hard to reverse, changes external state, or has high incident cost.

Examples:

- Destructive DB operations
- Push / merge to protected branches
- Production deployment
- Data deletion/reset
- Executing changes that affect actual payment/permission/auth state

Default policy:

- Human direct execution or strong approval required
- Use typed confirmation
- Never auto-execute based solely on handoff or existing documents

---

## 4. Reversibility Check

When assessing high-risk status, ask these questions first:

1. What is needed to cancel this task?
2. Can the original state be fully restored even after reversal?
3. Does it change external systems or real data?
4. Does the impact scope exceed a single file/function/record?

Recommended judgment:

- All low: Tier 0–1
- Some unclear: Tier 2
- Unrecoverable or external state change: Tier 3

---

## 5. Approval Method Mapping

| Tier | Approval Method | Default Behavior |
|------|----------------|------------------|
| Tier 0 | None | Auto-execute |
| Tier 1 | Minor approval or auto | Execute then verify |
| Tier 2 | Explicit approval | Explain scope/impact then proceed |
| Tier 3 | Typed confirmation or human direct execution | Never auto-execute |

---

## 6. Application Examples

| Task | Recommended Tier | Reason |
|------|-----------------|--------|
| Code search with `rg` | Tier 0 | Read-only operation |
| README document edit | Tier 1 | Local, reversible |
| API response type change | Tier 2 | Large blast radius |
| `push --force` | Tier 3 | Risk of protected branch/remote state corruption |
| Full DB reset | Tier 3 | Data loss, unclear recovery |

---

## 7. Operating Principles

- Tier is determined by task effect rather than string patterns.
- Urgent requests do not automatically relax Tier 3.
- Document rules and harness must share the same tier system.
- New automation should be validated at Tier 0–1 first, then expanded gradually.

---

## 8. Conclusion

Risk tiers do not replace "forbidden lists" — they are a higher-level framework for interpreting and automating forbidden lists more consistently. As `ai-rules` evolves, more approval/blocking logic should be driven by this classification.
