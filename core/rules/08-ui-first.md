# 08-ui-first — UI Assets First Principle

## Core Principle

Before starting any frontend page/component implementation, **you must first discover and review existing HTML mockup files in the project.**

Proactively search even if not listed in INTENT.md `context.docs`.
Starting UI implementation without checking mockups → **auto-fail** (prevents building UI from scratch that doesn't match existing mockups)

---

## HTML Mockup Discovery Procedure (Required)

Run the following command before starting any frontend work:

```bash
find {project_root} -name "*.html" \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -name "index.html"
```

- `index.html` excluded because Vite/CRA entry files are not mockups
- Report the number of HTML files found + their paths to the user
- If mockup HTML exists → **read it first** and extract design tokens before starting implementation

---

## What to Extract from Mockup HTML

| Item | What to Check |
|------|--------------|
| Color palette | CSS variables, Tailwind classes, hardcoded color values |
| Layout structure | Sidebar/header/content area arrangement |
| Typography | Font family, size, weight |
| Component patterns | Card, table, form, button styles |
| Interaction hints | hover, active, disabled states |

Record extracted tokens in two formats:
- `docs/design/DESIGN_TOKENS.md` — human-readable markdown document
- `docs/design/design-tokens.json` — structured data for AI reuse (Google A2UI pattern)

Minimum `design-tokens.json` structure:
```json
{
  "colors": { "primary": "#...", "background": "#..." },
  "typography": { "fontFamily": "...", "baseSize": "16px" },
  "spacing": { "unit": "4px" },
  "components": { "button": { "borderRadius": "..." } }
}
```

---

## When No Mockups Exist

If zero HTML mockup files are found:
- Ask the user: "No mockup files found. May I proceed with an arbitrary design?" — then proceed after confirmation
- Never make arbitrary design decisions without confirmation

---

## Scope

- New page component implementation
- Major UI changes to existing pages
- Initial frontend setup for new projects

Simple bug fixes (layout breakage, color errors, etc.) → discovery may be skipped
