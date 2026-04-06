# ci-safety-net — 3-Layer CI Safety Net

> Example extension for projects with multi-layer CI protection.

## Layer 1: Pre-Merge Validation

**Trigger**: On PR create/update (`.github/workflows/pre-merge-validation.yml`)

Checks:
1. API Contract Check (Frontend-Backend contract match)
2. DB Migration Check (model change → migration required)
3. Critical File Change (1000+ lines warning)
4. Security Scan (hardcoded secrets + npm audit)

On failure: Auto-comment on PR + Branch Protection blocks merge

## Layer 2: Post-Merge Recovery

**Trigger**: On push to develop branch (`.github/workflows/post-merge-recovery.yml`)

Auto-recovery on failure:
1. Auto-create revert branch (`revert-{sha}`)
2. Auto-create revert PR
3. Auto-create urgent issue

No direct push to develop / No force push

## Layer 3: Scheduled Audit

**Trigger**: Daily at 01:00 (`.github/workflows/e2e-nightly.yml`)

On failure: Auto-create GitHub issue with `e2e-regression` label

## Branch Protection Settings

**develop**: PR required (1 approval) + status checks (frontend-check, backend-check, api-contract-check, db-migration-check, security-check)

**main**: PR required (2 approvals) + above checks + staging deploy success required

## E2E Test Policy

- **Local first**: Run `npm run test:e2e` before pushing to main/develop
- **Develop PR**: Lightweight CI only (lint + type + unit, ~4min)
- **Main PR**: Full CI + E2E smoke (~15min)
