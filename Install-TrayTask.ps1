#Requires -Version 5.1

<#
.SYNOPSIS
    Builds the launcher tray application and registers it to start at logon.

.DESCRIPTION
    Publishes tray/ClaudeLauncherTray.csproj to tray/publish, then registers a
    scheduled task that starts it when the current user logs on.

    Task Scheduler is used rather than a Startup shortcut because it supports a
    startup delay — the session needs the network up and Claude Code's
    credentials available — and because it restarts the tray if it fails.

    The tray runs the same Start-Launcher.ps1 that you would run by hand, in a
    terminal window it keeps hidden until you ask for it from the tray menu.

.PARAMETER SessionName
    Remote Control session name to start. Defaults to "Launcher".

.PARAMETER UseConsoleHost
    Host the session in a classic console window instead of Windows Terminal.
    Renders Claude Code's interface less well, but never flashes a window on
    screen at logon. Chosen automatically when Windows Terminal is not
    installed.

.PARAMETER AutoRestart
    Restart the session automatically if its window disappears.

.PARAMETER StartDelaySeconds
    How long after logon to start the tray. Defaults to 30 seconds.

.PARAMETER TaskName
    Name of the scheduled task. Defaults to "Claude Launcher Tray".

.PARAMETER SkipBuild
    Register the task without rebuilding, using whatever is already published.

.PARAMETER StartNow
    Start the tray as soon as the task is registered, instead of waiting for the
    next logon.

.PARAMETER Uninstall
    Remove the scheduled task. The published files are left in place.

.EXAMPLE
    .\Install-TrayTask.ps1

.EXAMPLE
    .\Install-TrayTask.ps1 -SessionName "Launcher (laptop)" -AutoRestart -StartNow

.EXAMPLE
    .\Install-TrayTask.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [string]$SessionName = 'Launcher',

    [switch]$UseConsoleHost,

    [switch]$AutoRestart,

    [ValidateRange(0, 3600)]
    [int]$StartDelaySeconds = 30,

    [ValidateNotNullOrEmpty()]
    [string]$TaskName = 'Claude Launcher Tray',

    [switch]$SkipBuild,

    [switch]$StartNow,

    [switch]$Uninstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
if (-not $projectRoot) {
    throw 'Unable to determine the repository root. Run this file as a script (.\Install-TrayTask.ps1) rather than pasting its contents into a console.'
}

if ($Uninstall) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

    if (-not $existing) {
        Write-Host "No scheduled task named '$TaskName' is registered." -ForegroundColor Yellow
        return
    }

    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed the scheduled task '$TaskName'." -ForegroundColor Green
    Write-Host 'Any tray icon already running is left alone; use its Exit menu item to close it.'
    return
}

$publishDirectory = Join-Path $projectRoot 'tray\publish'
$exePath = Join-Path $publishDirectory 'ClaudeLauncherTray.exe'

if (-not $SkipBuild) {
    if (-not (Get-Command -Name 'dotnet' -ErrorAction SilentlyContinue)) {
        throw 'Could not find the .NET SDK ("dotnet"). Install it from https://dotnet.microsoft.com/download, or pass -SkipBuild if the tray is already published.'
    }

    $projectFile = Join-Path $projectRoot 'tray\ClaudeLauncherTray.csproj'

    Write-Host "Publishing the tray application to $publishDirectory" -ForegroundColor Cyan
    & dotnet publish $projectFile -c Release -o $publishDirectory --nologo

    if ($LASTEXITCODE -ne 0) {
        throw "dotnet publish failed with exit code $LASTEXITCODE."
    }
}

if (-not (Test-Path -LiteralPath $exePath)) {
    throw "The tray application was not found at $exePath. Run without -SkipBuild to build it."
}

# Passed through to the tray; the repository is named explicitly so the task
# does not depend on where the executable ends up.
$argumentList = @(
    '--repo', "`"$projectRoot`""
    '--session-name', "`"$SessionName`""
)

if ($UseConsoleHost) { $argumentList += '--conhost' }
if ($AutoRestart) { $argumentList += '--auto-restart' }

$action = New-ScheduledTaskAction -Execute $exePath -Argument ($argumentList -join ' ') -WorkingDirectory $projectRoot

$userId = "$env:USERDOMAIN\$env:USERNAME"

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
if ($StartDelaySeconds -gt 0) {
    # PowerShell exposes the delay only as an ISO 8601 duration string.
    $trigger.Delay = "PT$($StartDelaySeconds)S"
}

# Interactive, non-elevated: a tray icon has to live in the user's own desktop
# session, and an elevated task would put it on a different integrity level to
# the shell that has to display it.
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Runs the Claude Remote Project Launcher session ($SessionName) from the notification area." `
    -Force | Out-Null

Write-Host "Registered the scheduled task '$TaskName'." -ForegroundColor Green
Write-Host "  Runs at logon for $userId, after a $StartDelaySeconds second delay."
Write-Host "  Command: $exePath $($argumentList -join ' ')"

if ($StartNow) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host 'Started the tray now; look for its icon in the notification area.' -ForegroundColor Green
}
else {
    Write-Host "Start it now with: Start-ScheduledTask -TaskName '$TaskName'"
}
