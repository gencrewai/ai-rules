# react-frontend — React/TypeScript Frontend Rules

> Example extension for React/TypeScript frontend projects.
> Extends core/02-code.md Frontend Hard Bans.

## Project-Specific Hard Bans

- **CSS Variables**: No unauthorized changes to `:root` CSS variables in `index.css` → invoke designer agent
- **New Tokens**: No direct addition of tokens not in `DESIGN_TOKENS.md` → invoke designer agent
- **Fonts**: Must comply with font rules defined in project docs

## Pre-Commit Self-Check

> core/02-code.md items (fetch/axios, dangerouslySetInnerHTML, console.log, colors, spacing) checked separately.
> Below are project-specific additional checks.

- [ ] Error states displayed to user (no silent failures)
- [ ] No CSS variable changes in `index.css`
- [ ] No new tokens outside `DESIGN_TOKENS.md`
