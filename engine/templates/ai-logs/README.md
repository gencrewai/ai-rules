# AI Usage Logs

This folder is the default directory for storing per-project AI conversation logs and terminal logs.

## Usage

Run the following command from the project root:

```bash
npm run ai:logs
```

Output:

- `ai_logs/raw/`: Raw transcripts and terminal logs
- `ai_logs/INDEX.md`: Draft index for submission or review

You can also pass source paths directly to the script for export:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\export_ai_logs.ps1 `
  -TranscriptSourceDir "C:\path\to\agent-transcripts" `
  -TerminalSourceDir "C:\path\to\terminals"
```

Once `INDEX.md` is generated, update it with the relevant context and deliverables for your project.
