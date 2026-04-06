# BYPASS_POLICY — Bypass Policy Management Standards

> Purpose: Define the allowed scope and audit criteria for exception paths such as `SKIP_E2E`, manual approval bypass, and conditional deployment, to prevent them from spreading in an uncontrolled manner.
> Related documents:
> - [DEPLOYMENT_CONTRACT.md](DEPLOYMENT_CONTRACT.md)
> - [DOMAIN_THRESHOLD_MODEL.md](DOMAIN_THRESHOLD_MODEL.md)

---

## Why a Bypass Policy is Needed

In practice, there are moments when you cannot always pass every verification completely before proceeding.

Examples:

- Emergency incident response
- Temporary CI infrastructure outage
- Flaky E2E tests
- Situations requiring staging-only deployment first

The problem is that when bypass is allowed without an explicit policy:

- Bypassing becomes the default
- Failure learning disappears
- Quality standards erode across projects

Therefore, bypass must be an **explicit exception protocol**, not a "convenience feature".

---

## Definition of Bypass

A bypass is any action that exceptionally skips a verification, approval, or procedure that should normally be passed.

Examples:

- `SKIP_E2E=1`
- Ignoring specific status checks
- Forcing deployment in a conditional judgment state
- Skipping normal approval procedures
- Proceeding with merge/deploy while some thresholds are not met

---

## Core Principles

### 1. Bypass must never become the default

- Bypass must always be an exception
- Undocumented bypasses are forbidden

### 2. Bypass must leave a trace

- Who
- Why
- What
- Until when

was bypassed must be recorded

### 3. Follow-up verification must follow a bypass

- Nightly audit
- Post-deploy verify
- Follow-up PR or revert preparation

### 4. Sensitive areas have narrower bypass allowance

The following must be treated much more strictly than general areas:

- `payment`
- `auth`
- `personal_data`
- `migration_safety`

---

## Bypass Classification

### 1. Acceptable Bypass

Conditionally allowed:

- Temporarily skipping flaky E2E tests
- Bypassing some non-critical smoke tests in staging deployment
- Switching to alternative verification during CI infrastructure outage

### 2. Restricted Bypass

Allowed only with senior approval and strong documentation:

- Forcing conditional state in production deployment
- Merging with some thresholds not met
- Proceeding on the premise of post-merge recovery

### 3. Forbidden Bypass

Never allowed in principle:

- Completely skipping security verification
- Bypassing DB destructive command safety rules
- Bypassing protected branch protections
- Allowing force push
- Any bypass that could expose sensitive information

---

## Approval Authority

### Standard Projects

- Staging bypass: project owner or user approval
- Production bypass: explicit user approval required

### Sensitive SaaS

- Staging bypass: owner approval + follow-up verification plan required
- Production bypass: explicit approval + audit record + rollback readiness required

---

## Minimum Bypass Record Format

All bypasses must include the following information.

```md
# Bypass Record

- project: my-saas-app
- environment: staging
- type: SKIP_E2E
- reason: flaky test on checkout flow
- approved_by: user
- expires_at: 2026-04-02
- follow_up:
  - nightly audit required
  - checkout E2E fix PR required
```

This record must preserve its meaning whether logged in a PR comment, deployment report, or separate audit log.

---

## Follow-up Verification Obligations

When a bypass is used, at least one of the following must follow:

- Nightly audit auto-execution
- Enhanced post-deploy smoke tests
- Follow-up fix PR created
- Rollback readiness confirmed
- FAILURE_LOG or audit log entry

---

## Relationship with Thresholds

Among the axes defined in `DOMAIN_THRESHOLD_MODEL.md`, the following have high bypass costs:

- `payment`
- `auth`
- `personal_data`
- `migration_safety`

When these axes fall below threshold:

- Not just conditional, but
- `additional approval required` or
- `deployment blocked`

can be escalated.

---

## Sensitive Service Standards

In sensitive services, bypass is not completely forbidden but must be treated as an **exception under strong controls**.

Examples:

- `SKIP_E2E` is for emergency situations only, not a general default
- When used, nightly audit or follow-up fixes must be automatically linked
- Payment/auth/personal data axes below threshold require even narrower bypass allowance

In other words, bypass in sensitive services must be a **deliberate decision to explicitly assume operational costs**, not "quickly moving past".

---

## Suggested Project Defaults

### Basic Projects

- Flaky test bypass allowed
- Staging bypass allowed
- Production bypass requires explicit approval

### Standard SaaS

- Staging bypass allowed with restrictions
- Production bypass very restricted
- auth/api_contract below threshold requires additional approval

### Sensitive Services

- Audit log required when bypass is used
- Production bypass requires strong approval + rollback readiness
- `payment`, `auth`, `personal_data`, `migration_safety` axes are hard-fail candidates

---

## Connection to Capability Matrix

This policy is subsequently managed in `PROJECT_CAPABILITY_MATRIX.md` with the following items:

- Bypass allowed or not
- Bypass record format
- Audit follow-up obligations
- Whether hard-fail domains exist

---

## One-Line Conclusion

What matters more than whether bypass is allowed is **documentation, approval, and follow-up verification**.
`ai-rules` must treat bypass not as "convenience" but as an **auditable exception procedure**.
