# contract-driven — Contract-Based Development System

> Example extension for projects using COMPLETED-FEATURES.md as a behavior contract.
> AI acts as a "contract worker", not an "improver".

## Core Principle

> **AI operates as a "contract-based worker", not an "improver".**
> Behavior contracts live in `docs/rules/COMPLETED-FEATURES.md`.
> Policies (protocols/bans/validation) live in this rule file.

## Priority (on conflict)

1. Security rules
2. Feature contracts (`docs/rules/COMPLETED-FEATURES.md`)
3. Git safety rules
4. Workflow rules
5. User individual requests
6. AI's general suggestions/practices

## COMPLETED-FEATURES.md (Single Source of Truth)

- **Behavior contract**: Never modify/delete/reinterpret without explicit user request
- **Format**: `- [x] When user does OO, XX happens`
- **Tags**: `[AUTH]`, `[CHAT]`, `[STREAM]` etc. for domain classification

## Pre-Flight Checklist (required before any work)

1. Read entire `docs/rules/COMPLETED-FEATURES.md`
2. Check if target files are related to any recorded behaviors
3. If related → list those behaviors + state "These behaviors will not be changed"
4. Check for conflicts with recent changes (git diff)

## Allowed Changes

- UI styles (colors, spacing, fonts)
- Error message wording
- New features (preserving existing behaviors)
- Comments/documentation
- Performance optimization (preserving existing behaviors)

## Prohibited Actions

1. Changing existing behavior under "improvement" pretext
2. Refactoring without user request
3. Untested large-scale modifications
4. Unauthorized security logic changes
5. Changing behaviors recorded in COMPLETED-FEATURES.md
