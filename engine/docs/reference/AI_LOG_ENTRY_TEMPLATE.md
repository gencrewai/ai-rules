# AI Log Entry Template

> Purpose: A common template for writing date-based AI log documents that are concise and verifiable.

---

## Core Principles

- Lead with the key point, not the introduction.
- The `Verification` block is required.
- Don't just summarize — include `Differences`, `Strengths`, `Limitations`, and `Suggested Actions`.
- Separate deep explanations into `guide/` documents.

---

## Recommended Template

```md
# YYYY-MM-DD — Title

> Written: YYYY-MM-DD
> Purpose: One line on why this document exists

## One-Line Summary

Core point in 1-2 sentences.

## Verification

- status: verified | inferred | needs-review
- source_type: official | status-page | third-party | mixed
- source_url: https://...
- evidence_path: `docs/log/YYYY/MM/_sources/...`

## Core Technology

- 3-5 key points

## Differences from Previous

| Comparison Target | Difference |
|-------------------|------------|
| Previous approach | What changed |

## Strengths

- ...

## Limitations

- ...

## ai-rules Perspective Notes

- ...

## What to Watch Next

- ...

## Suggested Actions

- ...
```

---

## Status Criteria

### verified

- Official documentation or official status page exists
- Date, title, and core claims can be confirmed
- `evidence_path` is provided

### inferred

- Official information exists but interpretation is mixed in
- The interpretive nature is clearly disclosed in the body text

### needs-review

- Heavy reliance on secondary sources or facts are insufficiently verified
- Separate marking recommended in the monthly index

---

## Minimum Checklist

- [ ] Is the one-line summary immediately understandable?
- [ ] Is verification information present?
- [ ] Are differences / strengths / limitations included?
- [ ] Is there an `ai-rules perspective notes` section?
- [ ] Are there next actions or follow-up observation points?
