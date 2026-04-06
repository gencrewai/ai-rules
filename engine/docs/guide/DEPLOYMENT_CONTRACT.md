# DEPLOYMENT_CONTRACT — Common Deployment Contract

> Purpose: Define a common contract so that projects can operate under the same deployment policies and verification flows, regardless of their individual server/infrastructure differences.
> Related documents: [BYPASS_POLICY.md](BYPASS_POLICY.md), [DOMAIN_THRESHOLD_MODEL.md](DOMAIN_THRESHOLD_MODEL.md)

---

## Why a Deployment Contract is Needed

Deployment methods can vary across projects:

- Vercel
- Cloudflare Pages
- Docker + VM
- Kubernetes
- GitHub Actions-based manual/semi-automated deployment

However, the operational rules that must be checked before and after deployment are largely common.

In other words, **deployment policy should be standardized while actual execution is separated into adapters**.

---

## Common Principles

### 1. Separate policy from execution

- Policy: when is deployment allowed, what must be verified
- Execution: what commands deploy where

### 2. Deployment must pass through staged gates

- pre-merge
- pre-deploy
- deploy
- post-deploy verify
- rollback

### 3. Approval criteria vary by risk level

- Staging deployment: automatic or single approval
- Production deployment: explicit approval required
- Deployment with DB changes: additional safety review required

### 4. Deployment results must be recorded in a common report format

- What environment was deployed to
- What verifications were passed
- What bypasses were used
- Whether rollback occurred

---

## Common Deployment Contract

All projects must conceptually satisfy the following interface.

### 1. `pre_merge_checks`

Purpose:
- Verify that code meets minimum quality criteria before PR merge

Default checks:
- lint
- typecheck
- unit test
- security scan
- API contract check
- migration safety check

Output:
- `pass`
- `conditional`
- `fail`

### 2. `pre_deploy_checks`

Purpose:
- Re-verify environment-specific risk factors immediately before deploying to a specific environment

Default checks:
- Current branch/tag verification
- Target environment confirmation (`staging` / `production`)
- Missing environment variables
- Build artifact generation capability
- Whether DB migration is included
- Whether bypass is being used

Output:
- `deployable`
- `approval_required`
- `blocked`

### 3. `deploy_staging`

Purpose:
- Deploy to staging environment

Requirements:
- `pre_deploy_checks` passed
- Staging adapter exists
- Post-deploy verify auto-executes

### 4. `deploy_production`

Purpose:
- Deploy to production environment

Requirements:
- Explicit approval required
- Production adapter exists
- Rollback or recovery rail exists
- Post-deploy verify auto-executes

### 5. `rollback`

Purpose:
- Return to a stable state when deployment fails or regression occurs

Allowed methods (examples):
- Revert deployment
- Redeploy previous artifact
- Rollback script
- Auto-generate revert PR

Minimum requirements:
- Rollback capability must be stated
- Auto/manual must be stated
- Next action on failure must be stated

### 6. `post_deploy_verify`

Purpose:
- Verify actual service state after deployment

Default checks:
- Health endpoint
- Smoke test
- Key user flows
- Error rate / log anomaly check

Output:
- `healthy`
- `degraded`
- `rollback_required`

---

## Per-Environment Default Policies

### Staging

- Automatic deployment allowed
- However, `pre_deploy_checks` must pass
- Smoke test failure results in `degraded`

### Production

- User or operations approval required
- Bypass usage requires separate documentation
- Production deployment without a rollback path is forbidden in principle

---

## Deployment Adapter Architecture

Deployment adapters are the actual implementations of the common contract.

Examples:

- `adapter/vercel`
- `adapter/cloudflare-pages`
- `adapter/docker-vm`
- `adapter/k8s`
- `adapter/github-actions`

Each adapter must provide at minimum:

- Supported environments (`staging`, `production`)
- Deploy command
- Rollback support
- Health check method
- Required secrets
- Build artifact approach

---

## Per-Project Override Scope

The following can be overridden per project:

- Deploy target
- Build command
- Required secrets
- Smoke test scenarios
- Domain-specific verify items

The following remain as common policy:

- Production approval required
- Bypass record required
- Post-deploy verify required
- Rollback capability must be stated

---

## Sensitive Service Mapping Examples

### What can be commonly extracted from sensitive services

- Pre-merge validation
- Branch protection
- Post-merge recovery
- Scheduled audit

### What should remain as project-specific overrides

- Payment/auth enhanced verification
- Project-specific thresholds
- Project-specific deployment modes

---

## Minimum Deployment Report Format

```md
# Deployment Report

- project: my-saas-app
- environment: staging
- adapter: docker-vm
- commit: abc1234
- pre_merge_checks: pass
- pre_deploy_checks: deployable
- bypass_used: none
- post_deploy_verify: healthy
- rollback: not_needed
```

This format must preserve the same meaning whether in Markdown or JSON.

---

## Connection to Capability Matrix

This contract is subsequently managed in `PROJECT_CAPABILITY_MATRIX.md` with the following items:

- Deploy adapter
- Staging support
- Production support
- Rollback support
- Post-deploy verify level
- Bypass allowed or not

---

## One-Line Conclusion

Even when deployment environments differ, **deployment policies and verification flows can be unified into a common contract.**
`ai-rules` uses this contract as the baseline, and each project implements actual deployment through adapters.
