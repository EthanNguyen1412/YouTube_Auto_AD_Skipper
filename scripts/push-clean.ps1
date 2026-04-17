param(
  [string]$RepoUrl = "https://github.com/EthanNguyen1412/YouTube_Auto_AD_Skipper.git",
  [string]$Branch = "main",
  [string]$CommitMessage = "chore: publish clean public set"
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

# Ensure public-clean focus.
if (Test-Path (Join-Path $projectRoot "dist")) {
  Remove-Item (Join-Path $projectRoot "dist") -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $projectRoot "scripts\\package.ps1")) {
  Remove-Item (Join-Path $projectRoot "scripts\\package.ps1") -Force -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $projectRoot "scripts\\push-github.ps1")) {
  Remove-Item (Join-Path $projectRoot "scripts\\push-github.ps1") -Force -ErrorAction SilentlyContinue
}

& git add .
if ($LASTEXITCODE -ne 0) { throw "git add failed." }

$hasChanges = (& git status --porcelain)
if ($hasChanges) {
  & git commit -m $CommitMessage
  if ($LASTEXITCODE -ne 0) { throw "git commit failed." }
} else {
  Write-Host "No new changes to commit."
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

Write-Host "Push completed: $RepoUrl ($Branch)"
