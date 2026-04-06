# DOMAIN_THRESHOLD_MODEL — Per-Domain Verification Threshold Model

> Purpose: Define a baseline model so that per-project verifier/judge systems share common scoring axes while selectively enabling additional thresholds based on domain sensitivity.
> Related documents:
> - [DEPLOYMENT_CONTRACT.md](DEPLOYMENT_CONTRACT.md)
> - [BYPASS_POLICY.md](BYPASS_POLICY.md)

---

## Why a Threshold Model is Needed

Not all projects carry the same level of risk:

- Simple documentation/dashboard projects
- Standard SaaS projects
- Services handling auth/payment/personal data

Ignoring these differences and applying uniform confidence thresholds means:

- Sensitive projects become too lenient
- Simple projects become unnecessarily strict

Therefore, `ai-rules` must define thresholds using a **common base axes + per-project optional axes** structure.

---

## Model Structure

Thresholds are divided into two layers.

### 1. Base Axes (common to all projects)

Required evaluation axes that must always be present:

- `structure`
- `convention`
- `domain`

### 2. Optional Axes (enabled based on project characteristics)

Added based on domain sensitivity:

- `payment`
- `auth`
- `personal_data`
- `api_contract`
- `migration_safety`
- `error_handling`
- `dependencies`

---

## Base Axis Definitions

### `structure`

What is evaluated:

- File/module structure appropriateness
- Separation of responsibilities
- Excessive coupling
- Component/service boundaries

Low score examples:

- Excessive implementation concentrated in a single file
- Controller/service/repo boundary collapse
- Increasing duplicate structures

### `convention`

What is evaluated:

- Code style consistency
- Naming conventions
- Adherence to existing patterns
- Rule violations

Low score examples:

- Ignoring existing project patterns
- Introducing exceptional implementation approaches
- Circumventing forbidden rules

### `domain`

What is evaluated:

- Requirements fulfillment
- Core business flow preservation
- Alignment between intent and actual implementation

Low score examples:

- Partial requirements omission
- Key user flow breakage
- Changes with high regression risk

---

## Optional Axis Definitions

### `payment`

Activation targets:

- Payments
- Settlements
- Billing
- Refunds

What is evaluated:

- Amount/state transition stability
- Duplicate/missed payment prevention
- Payment post-flow maintenance

### `auth`

Activation targets:

- Login
- Logout
- Sessions
- Tokens
- Permissions

What is evaluated:

- Authentication flow preservation
- Permission bypass potential
- Session expiry/recovery handling

### `personal_data`

Activation targets:

- Personal information
- Sensitive profile data
- Customer identification data

What is evaluated:

- Exposure risk
- Storage/transmission path safety
- Masking/filtering

### `api_contract`

Activation targets:

- Frontend-backend contracts
- External API integrations
- SDK/public interfaces

What is evaluated:

- Signature changes
- Response format regression
- Backward compatibility

### `migration_safety`

Activation targets:

- DB schema changes
- Migrations
- Seed/transform operations

What is evaluated:

- Destructive change risk
- Rollback possibility
- Data preservation

### `error_handling`

Activation targets:

- User error handling
- API error handling
- Retry/recovery flows

What is evaluated:

- User feedback on failure
- Missing exception handling
- Swallowed errors

### `dependencies`

Activation targets:

- New package introduction
- Version upgrades
- Runtime dependency changes

What is evaluated:

- Unnecessary library introduction
- Security/compatibility risks
- Increased operational burden

---

## Recommended Activation by Project Type

### 1. Basic Projects

Active axes:

- `structure`
- `convention`
- `domain`

### 2. Standard SaaS

Active axes:

- `structure`
- `convention`
- `domain`
- `auth`
- `api_contract`
- `error_handling`

### 3. Sensitive SaaS

Active axes:

- `structure`
- `convention`
- `domain`
- `payment`
- `auth`
- `personal_data`
- `api_contract`
- `migration_safety`
- `error_handling`
- `dependencies`

---

## Recommended Threshold Examples

### Basic Projects

```yaml
domains:
  structure: 60
  convention: 60
  domain: 55
overall_min_score: 58
```

### Standard SaaS

```yaml
domains:
  structure: 70
  convention: 70
  domain: 65
  auth: 72
  api_contract: 70
  error_handling: 68
overall_min_score: 69
```

### Sensitive Services

```yaml
domains:
  structure: 70
  convention: 70
  domain: 68
  payment: 90
  auth: 85
  personal_data: 88
  api_contract: 75
  migration_safety: 90
  error_handling: 72
  dependencies: 70
overall_min_score: 78
```

---

## Judgment Principles

### PASS

- Overall score passes
- All required optional axes also pass

### CONDITIONAL

- Overall score is close but
- Some axes fall below threshold
- Fix conditions are clear

### FAIL

- Overall score below threshold
- Or any sensitive axis (`payment`, `auth`, `migration_safety`) is critically below threshold

---

## Operating Principles

### 1. Base axes are always maintained

Regardless of project size:

- `structure`
- `convention`
- `domain`

must always be present.

### 2. Optional axes are enabled in profiles

Per project:

- Which axes to enable
- What minimum scores to set
- Which axes are hard-fail

are decided in the profile or governance config.

### 3. Sensitive axes can be hard-fail

The following axes can be promoted to hard-fail targets depending on the project:

- `payment`
- `auth`
- `personal_data`
- `migration_safety`

---

## Sensitive Service Application Direction

Sensitive services have higher sensitivity than standard SaaS.

Therefore, sensitive services must strongly enable the following in addition to the common base axes:

- `payment`
- `auth`
- `personal_data`
- `api_contract`
- `migration_safety`

And this configuration should not be a project-specific strict mode but can be generalized as the baseline for a future `sensitive SaaS preset`.

---

## Next Connected Documents

Based on this document, the following will be defined next:

- `BYPASS_POLICY.md`
- `PROJECT_CAPABILITY_MATRIX.md`

---

## One-Line Conclusion

Domain verification should never end with a single score.
`ai-rules` must manage thresholds using a **common base axes + per-project optional axes** structure,
and the sensitive service preset becomes the most stringent baseline among them.
