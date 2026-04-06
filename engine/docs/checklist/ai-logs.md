# AI Logs Kickoff

New projects include `ai_logs/` and `scripts/export_ai_logs.ps1` by default.

## Basic Usage

Run the following command from the project root.

```bash
npm run ai:logs
```

## Generated Output

- `ai_logs/raw/`: original transcripts, terminal logs
- `ai_logs/INDEX.md`: draft index for review

## Checklist

- Verify that the `ai:logs` script has been added to `package.json`
- Verify that `scripts/export_ai_logs.ps1` has been created
- Verify that `ai_logs/README.md` and `ai_logs/raw/.gitkeep` have been created
- Before submission, fill in `Used For` and `Related Outputs` in `ai_logs/INDEX.md`
