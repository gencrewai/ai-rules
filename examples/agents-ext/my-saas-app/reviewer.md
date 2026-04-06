### Design Token Verification

- [ ] No hardcoded color values (`#xxx`, `rgb()` → CSS variables or Tailwind classes)
- [ ] No arbitrary spacing values (`p-[13px]` → Tailwind standard scale)
- [ ] Font rules compliance
- [ ] No unauthorized CSS variable (`:root`) changes in index.css
- [ ] New colors/spacing registered in DESIGN_TOKENS.md

### API Contract Verification

- [ ] Response envelope compliance (`{ok, data/error, meta}`)
- [ ] JSON keys in camelCase
- [ ] Error codes in standard format (`{CATEGORY}_{HTTP}`)
- [ ] Standard pagination meta used

### Reference Documents

- `docs/security/00_INDEX.md`
- `docs/api-contract/00_INDEX.md`
- `docs/design/DESIGN_TOKENS.md`
