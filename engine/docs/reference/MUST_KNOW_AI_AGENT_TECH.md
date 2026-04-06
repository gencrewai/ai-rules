# Must-Know AI Agent Tech

> Purpose: A concise, practical overview of core AI agent technology concepts that are helpful to know before reading the handbook.

---

## 1. Tool Use

The ability for a model to invoke external functions, APIs, search, file systems, browsers, and other tools.

Why it matters:

- It creates the boundary between answer models and execution models
- Permission, verification, and auditability issues start here

---

## 2. Computer Use

The ability for a model to operate actual UIs through mouse, keyboard, and screenshot-based interaction.

Why it matters:

- Enables automation even for systems without APIs
- At the same time, blast radius increases

---

## 3. Reasoning Model

A family of models that think longer or work through multiple steps before answering.

Why it matters:

- Can solve more complex problems
- But thinking longer does not inherently mean safer

---

## 4. Thinking Model

Models that surface reasoning as a product feature. A term frequently encountered when reading about Google Gemini 2.5, OpenAI o-series, and GPT-5 class models.

Why it matters:

- Reasoning has moved from a research concept to a core product architecture

---

## 5. Agent Orchestration

The layer that ties multiple tool calls, multiple steps, and multiple agent handoffs into an actual workflow.

Why it matters:

- Real agent quality depends on orchestration, not just the model
- Tracing, retry, fallback, and guardrails go here

---

## 6. Observability

The state of being able to trace what steps an agent took and what it did.

Why it matters:

- Enables failure root cause analysis
- Reduces false positives and excessive autonomy

---

## 7. Prompt Injection

The problem where adversarial instructions embedded in web pages, files, search results, or tool outputs hijack agent behavior.

Why it matters:

- The moment an agent reads tool output, the attack surface expands
- Simple prompt policies alone are not enough to prevent it

---

## 8. Guardrail / Harness

A structure outside the model that blocks, verifies, or approves actions.

Why it matters:

- As capability grows, guardrails become more important
- Control at the execution layer matters more than rule text

---

## 9. Approval Boundary

The boundary defining what an agent can do automatically and what requires human approval.

Why it matters:

- Must reduce approval fatigue while still controlling risk

---

## 10. Verification

Distinguishing whether the information being read is from an official document, an inference, or pending review.

Why it matters:

- It is the last line of defense for maintaining the quality of automated logs and the handbook

---

## ai-rules Perspective Notes

- The handbook is more valuable when it connects these concepts to actual logs and uses them as material for operational decisions, rather than being a simple news roundup.
- This is why the structure of operating date-based logs alongside in-depth guide/reference documents works well.
