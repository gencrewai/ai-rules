# AI Vibe Coding Guide

> Date: 2026-04-01  
> Purpose: A collaboration guide for building code with AI — maximize productivity while minimizing scope drift and quality degradation

---

## 1. What Is Vibe Coding

In this document, vibe coding does not mean "just wing it." It is closer to a collaboration approach where you break work into small units and clearly communicate intent and constraints to delegate effectively to AI.

The three key principles:

- Break into small units
- Define verification criteria first
- Externalize ambiguity through documents or plans

---

## 2. Good Work Units

The more of these conditions a task satisfies, the better the AI collaboration efficiency.

- Explainable in one sentence
- Narrow impact scope
- Clear verification method
- Easy to revert on failure

Good examples:

- "Fix just this one type error"
- "Update the README install steps to match the current scripts"
- "Clean up the null handling in this function and only check tests within existing scope"

---

## 3. Bad Work Units

These types tend to produce unstable results.

- Large tasks with mixed requirements
- Requests that specify implementation means rather than goals
- Tasks that change external state without approval
- Tasks with no success criteria

Bad examples:

- "Improve the overall architecture however you see fit"
- "It's urgent so skip the rules and just get it done"
- "Tear everything down and rebuild it the best way"

---

## 4. Good Request Patterns

The more of these elements a request contains, the better.

- Goal: What are you trying to change
- Scope: How far should changes reach
- Constraints: What must not be touched
- Verification: What determines "done"

Example:

```md
Goal: Add 5 handbook drafts under docs/
Scope: Modify docs only, do not change core rules
Constraints: Maintain existing guide tone, use English filenames
Verification: Check that document links and structure are natural
```

---

## 5. Distinguishing Rules, Guides, and Harness

A common cause of AI collaboration instability is mixing content of different natures into a single document.

- Rules: Short policies that must be followed
- Guides: Background knowledge explaining the "why"
- Harness: Code and procedures that actually block/verify/approve

Recommended principles:

- Keep rules short
- Move explanations to handbooks
- Enforce through harness

---

## 6. Recommended Workflow

1. Summarize the intent in one sentence.
2. Exclude out-of-scope work upfront.
3. Execute in small units.
4. Verify the results.
5. Record non-obvious judgments.

This flow is especially effective for document cleanup, refactoring, and rule design — more so than for large features.

---

## 7. Reducing Approval Fatigue

If approval requests come too frequently, humans end up skipping without reading. Therefore, make high-risk approvals strong and automate low-risk tasks.

Recommended approach:

- Low risk: Auto or simple approval
- Medium risk: Explain scope then explicit approval
- High risk: Typed confirmation including task details

---

## 8. Benefits of a Document-First Approach

Why documentation matters when working with AI:

- Requirements are not lost in conversation
- Easily handed off to the next session or a different agent
- Decisions can be traced back to their rationale
- Enables role separation across handbook, INTENT, SESSION, and WORKLOG

---

## 9. Conclusion

Good vibe coding is not about relying on gut feeling — it is about supporting what appears to be intuitive with small work units and clear verification in practice. `ai-rules` handbooks and harness should serve as the foundation that makes this collaboration reliable.
