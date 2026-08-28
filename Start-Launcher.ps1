#Requires -Version 5.1

<#
.SYNOPSIS
    Starts the "Launcher" Claude Code remote-control session for this repository.

.DESCRIPTION
    Runs `claude --remote-control Launcher` with the working directory set to the
    repository root, taken from this script's own location. The session appears
    under the name "Launcher" in the Claude app's Remote Control session list,
    and can use this repository's /add-project, /list-projects and
    /launch-project skills to start further remote-control sessions for other
    projects.

    The session runs attached to the current terminal, which
    `claude --remote-control` needs for its TTY, so run this from a terminal
    window rather than from another process.

.PARAMETER SessionName
    Name to register the Remote Control session under. Defaults to "Launcher".

.EXAMPLE
    .\Start-Launcher.ps1

.EXAMPLE
    .\Start-Launcher.ps1 -SessionName "Launcher (laptop)"
#>
[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [string]$SessionName = 'Launcher'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
if (-not $projectRoot) {
    throw 'Unable to determine the repository root. Run this file as a script (.\Start-Launcher.ps1) rather than pasting its contents into a console.'
}

# Overridable for users whose Claude Code binary is named or installed differently,
# matching getClaudeCommand() in lib/launcher.js.
$claudeCommand = if ($env:CLAUDE_CLI_COMMAND) { $env:CLAUDE_CLI_COMMAND } else { 'claude' }

if (-not (Get-Command -Name $claudeCommand -ErrorAction SilentlyContinue)) {
    throw "Could not find the Claude Code CLI ('$claudeCommand'). Install it, or set CLAUDE_CLI_COMMAND to its full path."
}

Write-Host "Starting Claude remote-control session '$SessionName' in $projectRoot" -ForegroundColor Cyan

Push-Location -LiteralPath $projectRoot
try {
    & $claudeCommand --remote-control $SessionName
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
