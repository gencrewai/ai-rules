# AI Rules Handbook

`ai-rules` is both a rule repository and an operational knowledge base. This document helps you quickly distinguish between actual rules and reference guides.

---

## Quick Navigation

### Core Handbook

- [Harness Engineering](guide/HARNESS_ENGINEERING.md)
- [AI Risk Tiers](guide/AI_RISK_TIERS.md)
- [AI Vibe Coding Guide](guide/AI_VIBE_CODING_GUIDE.md)
- [Agent Operating Model](guide/AGENT_OPERATING_MODEL.md)
- [Git Flow Hygiene](guide/GIT_FLOW_HYGIENE.md)
- [Human Authority Model](guide/HUMAN_AUTHORITY_MODEL.md)
- [Agent Autonomy Comparison](guide/AGENT_AUTONOMY_COMPARISON.md)

### Extended Reading

- [AI Log Automation Model](guide/AI_LOG_AUTOMATION_MODEL.md)
- [ChatOps Reference](guide/CHATOPS_REFERENCE.md)
- [AI Log Entry Template](reference/AI_LOG_ENTRY_TEMPLATE.md)
- [Must-Know AI Agent Tech](reference/MUST_KNOW_AI_AGENT_TECH.md)
- [2025 AI Log](log/2025/00_INDEX.md)
- [2026-03 AI Log](log/2026/03/00_INDEX.md)
- [2026-04-01 Living Handbook launch](changes/2026-04-01-living-handbook.md)
- [2026-04-04 OSS comparison analysis and enhancement decisions](changes/2026-04-04-oss-comparison-and-enhancement.md)
- [2026-04-04 CI hardening and rule quality validation roadmap](changes/2026-04-04-ci-and-eval-roadmap.md)

## For Newcomers

1. `README.md`
2. [Harness Engineering](guide/HARNESS_ENGINEERING.md)
3. [AI Risk Tiers](guide/AI_RISK_TIERS.md)
4. [AI Vibe Coding Guide](guide/AI_VIBE_CODING_GUIDE.md)

## Document Categories

### Rules

Short policy documents that directly govern agent behavior.

- Location: `core/*.md`, `extensions/*.md`
- Nature: must / must not / approval required
- Examples: protected branch restrictions, DB destructive operation bans, session handoff rules

### Guides

Documents explaining the background, design philosophy, examples, and operational patterns behind the rules.

- Location: `docs/guide/*.md`
- Nature: why / examples / patterns / trade-offs
- Examples: harness engineering, risk tiers, AI collaboration patterns

### Reference

Documents collecting frequently referenced templates, checkpoints, and technical references.

- Location: `docs/reference/*.md`
- Nature: template / reference / field guide
- Examples: log templates, essential AI tech references

### Change Log

Documents recording decisions and structural changes in chronological order.

- Location: `docs/changes/*.md`
- Nature: changed / why / impact
- Examples: new handbook introduction, approval friction policy adjustments, risk tier reorganization

### Log

Documents recording actual releases, incidents, and technology changes by date.

- Location: `docs/log/YYYY/MM/*.md`
- Nature: what happened / core technology / why it matters / source
- Examples: model launches, product feature announcements, official incidents, monthly summaries

## Recommended Reading Order

1. Harness: Understand why rules alone are not enough
2. Risk Tiers: Understand what to automate and to what extent
3. Vibe Coding: Understand good work units when collaborating with AI
4. Log: Check actual monthly changes and technology trends
5. Detailed planning/analysis docs: Review practical implementation approaches

## Operating Principles

- Keep rules short.
- Separate lengthy explanations and examples into the handbook.
- Record date-specific changes in `docs/changes/`.
- Only promote stabilized content to `core/` rules.
