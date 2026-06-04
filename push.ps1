<#  ============================================================
    push.ps1 - one-command publish for Eggie's Creator Hub

    From PowerShell (in this folder):
        .\push.ps1                  -> shows changes, asks for a message
        .\push.ps1 "fixed the dot"  -> commits with that message + pushes

    Or just double-click PUSH.cmd - same thing, no terminal needed.

    What it does: git add -A -> git commit -> git push origin main.
    First time ever pushing on this PC, a GitHub sign-in window may
    pop up - sign in once and Windows remembers it.

    NOTE: this file is deliberately plain ASCII (no emoji / special
    dashes). Windows PowerShell misreads fancy characters unless the
    file has a UTF-8 BOM, and that breaks the whole script.
    ============================================================ #>

param([string]$Message = "")

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot   # always run from the repo folder

function Say($text, $color = "White") { Write-Host $text -ForegroundColor $color }

# --- 0. sanity checks -------------------------------------------------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Say "`n[x] Git isn't installed (or isn't on PATH)." Red
    Say "    Grab it from https://git-scm.com/download/win then run this again." Yellow
    if (-not $Message) { Read-Host "`nPress Enter to close" }
    exit 1
}
if (-not (Test-Path ".git")) {
    Say "`n[x] This folder isn't a git repo - push.ps1 must live next to index.html." Red
    if (-not $Message) { Read-Host "`nPress Enter to close" }
    exit 1
}

Say ""
Say "Creator Hub publisher" Magenta
Say "---------------------" DarkGray

# --- 1. show what changed ---------------------------------------------
$changes = git status --porcelain
if (-not $changes) {
    Say "[ok] Nothing new to publish - everything is already pushed!" Green
    if (-not $Message) { Read-Host "`nPress Enter to close" }
    exit 0
}

Say "Changed files:" Cyan
git status --short | ForEach-Object { Say "  $_" Gray }
Say ""

# --- 2. commit message -------------------------------------------------
if (-not $Message) {
    $Message = Read-Host "Commit message (Enter for a dated default)"
}
if (-not $Message) {
    $Message = "Hub update - " + (Get-Date -Format "yyyy-MM-dd HH:mm")
}

# --- 3. stage + commit + push ------------------------------------------
git add -A
git commit -m $Message | Out-Null
Say "[ok] Committed: `"$Message`"" Green

Say "Pushing to GitHub..." Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
    Say "`n[x] Push failed. Most common fixes:" Red
    Say "    - First push on this PC? A GitHub sign-in window may have appeared - finish it and rerun." Yellow
    Say "    - Someone (or another PC) pushed first: run  git pull --rebase origin main  then rerun." Yellow
    if (-not $Message) { Read-Host "`nPress Enter to close" }
    exit 1
}

Say ""
Say "[ok] Pushed! Your update is on its way to creatorhub.eggieweggie.ca" Green
Say "     (Give the host a minute or two to rebuild, then hard-refresh: Ctrl+F5)" DarkGray
Read-Host "`nPress Enter to close"
