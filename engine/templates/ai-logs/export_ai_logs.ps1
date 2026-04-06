param(
    [string]$TranscriptSourceDir = "",
    [string]$TerminalSourceDir = "",
    [string]$DestinationDir = "",
    [string]$IndexPath = "",
    [int]$MaxTranscriptFiles = 200,
    [int]$MaxTerminalFiles = 50,
    [switch]$NoMask
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    param([string]$ScriptPath)
    return (Resolve-Path (Join-Path (Split-Path -Parent $ScriptPath) "..")).Path
}

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Get-RepoName {
    param([string]$RepoRoot)
    return (Split-Path -Leaf $RepoRoot)
}

function Convert-ToCursorSlug {
    param([string]$RepoRoot)

    $normalized = $RepoRoot.ToLowerInvariant() -replace "[:\\/]+", "-"
    return $normalized.Trim("-")
}

function Get-CursorProjectDirectories {
    param(
        [string]$RepoRoot,
        [string]$RepoName
    )

    $cursorRoot = Join-Path $env:USERPROFILE ".cursor\projects"
    if (-not (Test-Path -LiteralPath $cursorRoot)) {
        return @()
    }

    $dirs = @()
    $exactSlug = Convert-ToCursorSlug -RepoRoot $RepoRoot
    $exactPath = Join-Path $cursorRoot $exactSlug
    if (Test-Path -LiteralPath $exactPath) {
        $dirs += (Resolve-Path $exactPath).Path
    }

    $nameMatches = Get-ChildItem -LiteralPath $cursorRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "*$RepoName*" } |
        Select-Object -ExpandProperty FullName

    $dirs += $nameMatches

    return $dirs | Where-Object { $_ } | Select-Object -Unique
}

function Get-ClaudeProjectDirectories {
    param([string]$RepoName)

    $claudeRoot = Join-Path $env:USERPROFILE ".claude\projects"
    if (-not (Test-Path -LiteralPath $claudeRoot)) {
        return @()
    }

    return Get-ChildItem -LiteralPath $claudeRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "*$RepoName*" } |
        Select-Object -ExpandProperty FullName
}

function Resolve-SourceDirectory {
    param(
        [string]$Preferred,
        [string[]]$Candidates
    )

    if (-not [string]::IsNullOrWhiteSpace($Preferred) -and (Test-Path -LiteralPath $Preferred)) {
        return (Resolve-Path $Preferred).Path
    }

    foreach ($candidate in $Candidates) {
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path $candidate).Path
        }
    }

    return ""
}

function Mask-SensitiveContent {
    param([string]$Content)

    $masked = $Content
    $patterns = @(
        '(?i)(api[_-]?key\s*[:=]\s*["'']?)[A-Za-z0-9_\-\.]{8,}',
        '(?i)(token\s*[:=]\s*["'']?)[A-Za-z0-9_\-\.]{8,}',
        '(?i)(secret\s*[:=]\s*["'']?)[A-Za-z0-9_\-\.]{8,}',
        '(?i)(password\s*[:=]\s*["'']?)[^\s"''\\]{6,}',
        '(?i)Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*',
        '(?i)sk-[A-Za-z0-9]{10,}'
    )

    foreach ($pattern in $patterns) {
        $masked = [Regex]::Replace($masked, $pattern, '$1[REDACTED]')
        $masked = [Regex]::Replace($masked, '(?i)Bearer\s+[A-Za-z0-9\-\._~\+\/]+=*', 'Bearer [REDACTED]')
        $masked = [Regex]::Replace($masked, '(?i)sk-[A-Za-z0-9]{10,}', 'sk-[REDACTED]')
    }

    return $masked
}

function Convert-CursorJsonlToMarkdown {
    param([string]$FilePath)

    $lines = Get-Content -LiteralPath $FilePath -Encoding UTF8
    $output = [System.Text.StringBuilder]::new()
    $null = $output.AppendLine("# Cursor Conversation Log")
    $null = $output.AppendLine("")
    $null = $output.AppendLine("> Source: $FilePath")
    $null = $output.AppendLine("")

    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }

        try {
            $obj = $line | ConvertFrom-Json -ErrorAction Stop
        } catch {
            continue
        }

        $message = $null
        if ($obj.PSObject.Properties.Name -contains "message") {
            $message = $obj.message
        } elseif ($obj.PSObject.Properties.Name -contains "text") {
            $message = $obj.text
        }

        if ([string]::IsNullOrWhiteSpace($message)) {
            continue
        }

        $role = "assistant"
        foreach ($key in @("type", "role", "sender")) {
            if ($obj.PSObject.Properties.Name -contains $key -and -not [string]::IsNullOrWhiteSpace($obj.$key)) {
                $role = [string]$obj.$key
                break
            }
        }

        $roleLabel = if ($role -match "user") { "**[User]**" } else { "**[Assistant]**" }
        $null = $output.AppendLine($roleLabel)
        $null = $output.AppendLine("")
        $null = $output.AppendLine($message)
        $null = $output.AppendLine("")
        $null = $output.AppendLine("---")
        $null = $output.AppendLine("")
    }

    return $output.ToString()
}

function Convert-ClaudeCodeJsonl {
    param([string]$FilePath)

    $lines = Get-Content -LiteralPath $FilePath -Encoding UTF8
    $output = [System.Text.StringBuilder]::new()
    $null = $output.AppendLine("# Claude Code Conversation Log")
    $null = $output.AppendLine("")
    $null = $output.AppendLine("> Source: $FilePath")
    $null = $output.AppendLine("")

    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }

        try {
            $obj = $line | ConvertFrom-Json -ErrorAction Stop
        } catch {
            continue
        }

        if (-not ($obj.PSObject.Properties.Name -contains "type")) { continue }
        if (-not ($obj.PSObject.Properties.Name -contains "message")) { continue }
        if ($obj.type -ne "user" -and $obj.type -ne "assistant") { continue }

        $roleLabel = if ($obj.type -eq "user") { "**[User]**" } else { "**[Assistant]**" }
        $msgObj = $obj.message
        if (-not ($msgObj.PSObject.Properties.Name -contains "content")) { continue }

        $texts = @()
        if ($msgObj.content -is [System.Array]) {
            foreach ($block in $msgObj.content) {
                if (($block.PSObject.Properties.Name -contains "type") -and $block.type -eq "text" -and ($block.PSObject.Properties.Name -contains "text")) {
                    $texts += $block.text
                }
            }
        } elseif ($msgObj.content -is [string]) {
            $texts += $msgObj.content
        }

        foreach ($txt in $texts) {
            $null = $output.AppendLine($roleLabel)
            $null = $output.AppendLine("")
            $null = $output.AppendLine($txt)
            $null = $output.AppendLine("")
            $null = $output.AppendLine("---")
            $null = $output.AppendLine("")
        }
    }

    return $output.ToString()
}

$repoRoot = Get-RepoRoot -ScriptPath $PSCommandPath
$repoName = Get-RepoName -RepoRoot $repoRoot

if ([string]::IsNullOrWhiteSpace($DestinationDir)) {
    $DestinationDir = Join-Path $repoRoot "ai_logs\raw"
}
if ([string]::IsNullOrWhiteSpace($IndexPath)) {
    $IndexPath = Join-Path $repoRoot "ai_logs\INDEX.md"
}

Ensure-Directory -Path $DestinationDir
Ensure-Directory -Path (Split-Path -Parent $IndexPath)

$cursorProjects = Get-CursorProjectDirectories -RepoRoot $repoRoot -RepoName $repoName
$claudeProjects = Get-ClaudeProjectDirectories -RepoName $repoName

$transcriptCandidates = @()
foreach ($projectDir in $cursorProjects) {
    $transcriptCandidates += Join-Path $projectDir "agent-transcripts"
    $transcriptCandidates += Join-Path $projectDir "mcps\agent-transcripts"
}
foreach ($projectDir in $claudeProjects) {
    $transcriptCandidates += $projectDir
}
$transcriptCandidates += Join-Path $repoRoot "agent-transcripts"

$terminalCandidates = @()
foreach ($projectDir in $cursorProjects) {
    $terminalCandidates += Join-Path $projectDir "terminals"
}

$resolvedTranscriptSource = Resolve-SourceDirectory -Preferred $TranscriptSourceDir -Candidates $transcriptCandidates
$resolvedTerminalSource = Resolve-SourceDirectory -Preferred $TerminalSourceDir -Candidates $terminalCandidates

$exported = @()

if (-not [string]::IsNullOrWhiteSpace($resolvedTranscriptSource)) {
    $transcriptFiles = Get-ChildItem -LiteralPath $resolvedTranscriptSource -File -Filter "*.jsonl" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First $MaxTranscriptFiles

    $isClaudeCodeSource = $resolvedTranscriptSource -like "*\.claude\projects\*"

    foreach ($file in $transcriptFiles) {
        $destName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name) + ".md"
        $destPath = Join-Path $DestinationDir $destName

        if ($isClaudeCodeSource) {
            $content = Convert-ClaudeCodeJsonl -FilePath $file.FullName
        } else {
            $content = Convert-CursorJsonlToMarkdown -FilePath $file.FullName
        }

        if (-not $NoMask) {
            $content = Mask-SensitiveContent -Content $content
        }

        [System.IO.File]::WriteAllText($destPath, $content, [System.Text.Encoding]::UTF8)

        $exported += [PSCustomObject]@{
            Type          = "transcript"
            FileName      = $destName
            ExportedPath  = $destPath
            SourcePath    = $file.FullName
            LastWriteTime = $file.LastWriteTime
        }
    }
}

if (-not [string]::IsNullOrWhiteSpace($resolvedTerminalSource)) {
    $terminalFiles = Get-ChildItem -LiteralPath $resolvedTerminalSource -File -Filter "*.txt" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First $MaxTerminalFiles

    foreach ($file in $terminalFiles) {
        $destName = "terminal-" + $file.Name
        $destPath = Join-Path $DestinationDir $destName
        $content = Get-Content -LiteralPath $file.FullName -Raw

        if (-not $NoMask) {
            $content = Mask-SensitiveContent -Content $content
        }

        [System.IO.File]::WriteAllText($destPath, $content, [System.Text.Encoding]::UTF8)

        $exported += [PSCustomObject]@{
            Type          = "terminal"
            FileName      = $destName
            ExportedPath  = $destPath
            SourcePath    = $file.FullName
            LastWriteTime = $file.LastWriteTime
        }
    }
}

$now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$lines = @()
$lines += "# AI Logs Index"
$lines += ""
$lines += "> Auto-generated by `scripts/export_ai_logs.ps1` at $now"
$lines += ""
$lines += "## How To Use"
$lines += ""
$lines += '1. Run `npm run ai:logs` from the repository root.'
$lines += '2. Raw transcripts and terminal logs are copied to `ai_logs/raw/`.'
$lines += "3. Fill in the purpose and related outputs columns before submission."
$lines += ""
$lines += "## Sources"
$lines += ""
$lines += "- Transcript source: " + $(if ([string]::IsNullOrWhiteSpace($resolvedTranscriptSource)) { "(not found)" } else { $resolvedTranscriptSource })
$lines += "- Terminal source: " + $(if ([string]::IsNullOrWhiteSpace($resolvedTerminalSource)) { "(not found)" } else { $resolvedTerminalSource })
$lines += ""
$lines += "## Log List"
$lines += ""
$lines += "| Type | File | Exported At | Used For (manual) | Related Outputs (manual) |"
$lines += "|---|---|---|---|---|"

foreach ($entry in $exported | Sort-Object LastWriteTime -Descending) {
    $fileLink = "raw/$($entry.FileName)"
    $timeText = (Get-Date $entry.LastWriteTime -Format "yyyy-MM-dd HH:mm:ss")
    $lines += "| $($entry.Type) | [$($entry.FileName)]($fileLink) | $timeText | TODO | TODO |"
}

if ($exported.Count -eq 0) {
    $lines += "| - | (none) | - | TODO | TODO |"
}

[System.IO.File]::WriteAllLines($IndexPath, $lines, [System.Text.Encoding]::UTF8)

Write-Host "Export complete."
Write-Host "Transcript source : $resolvedTranscriptSource"
Write-Host "Terminal source   : $resolvedTerminalSource"
Write-Host "Destination       : $DestinationDir"
Write-Host "Index             : $IndexPath"
Write-Host "Count             : $($exported.Count)"
