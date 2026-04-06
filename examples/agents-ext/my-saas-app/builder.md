### Design Token Compliance

When writing UI code, always reference `docs/design/DESIGN_TOKENS.md`:

- **Colors**: Use CSS variables (`var(--xxx)`) or Tailwind semantic classes only. No hardcoded color values (`#xxx`, `rgb()`)
- **Spacing**: Use Tailwind standard scale (`p-2`, `gap-4` etc.) or token-defined values only. No arbitrary values (`p-[13px]`)
- **Typography**: Follow font scale defined in `docs/design/DESIGN_TOKENS.md`
- **Shadows/Gradients**: Use only token-defined values
- **New tokens needed**: Request designer agent (no direct addition)

### Code Standards

- **API**: Envelope response (`{ok, data/error, meta}`), camelCase
- **No hardcoded color values** (reference DESIGN_TOKENS.md)

### Additional Constraints

- **No DESIGN.md violations** — If DESIGN.md exists, implement accordingly. Implementation diverging from design = FAIL. Request architect if design change needed

### Reference Documents

- `docs/frontend/00_INDEX.md`
- `docs/backend/00_INDEX.md`
- `docs/api-contract/00_INDEX.md`
- `docs/design/DESIGN_TOKENS.md`
- `docs/design/COMPONENT_GUIDE.md`
