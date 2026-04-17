param(
  [string]$RepoUrl = "https://github.com/EthanNguyen1412/YouTube_Auto_AD_Skipper.git",
  [string]$Branch = "main",
  [string]$CommitMessage = "chore: release YouTube Auto Ad Skipper v1.3.0"
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git is not installed or not available in PATH."
}

if (-not (Test-Path (Join-Path $projectRoot ".git"))) {
  & git init
  if ($LASTEXITCODE -ne 0) { throw "git init failed." }
}

& git add .
if ($LASTEXITCODE -ne 0) { throw "git add failed." }

$hasChanges = (& git status --porcelain)
if (-not $hasChanges) {
  Write-Host "No changes to commit."
} else {
  & git commit -m $CommitMessage
  if ($LASTEXITCODE -ne 0) {
    throw "git commit failed."
  }
}

$remoteExists = (& git remote)
if ($remoteExists -match "^origin$") {
  & git remote set-url origin $RepoUrl
  if ($LASTEXITCODE -ne 0) { throw "git remote set-url failed." }
} else {
  & git remote add origin $RepoUrl
  if ($LASTEXITCODE -ne 0) { throw "git remote add failed." }
}

& git branch -M $Branch
if ($LASTEXITCODE -ne 0) { throw "git branch -M failed." }

& git push -u origin $Branch
if ($LASTEXITCODE -ne 0) { throw "git push failed." }

Write-Host "Push completed to $RepoUrl on branch $Branch"
