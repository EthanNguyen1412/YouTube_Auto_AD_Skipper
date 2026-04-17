param(
  [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$manifestPath = Join-Path $projectRoot "manifest.json"

if (-not (Test-Path $manifestPath)) {
  throw "manifest.json not found in project root."
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
if (-not $version) {
  throw "Version missing in manifest.json"
}

$distPath = Join-Path $projectRoot $OutputDir
if (-not (Test-Path $distPath)) {
  New-Item -ItemType Directory -Path $distPath | Out-Null
}

$zipName = "yt-auto-ad-skipper-v$version.zip"
$zipPath = Join-Path $distPath $zipName

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

$tempPath = Join-Path $distPath "package-temp"
if (Test-Path $tempPath) {
  Remove-Item $tempPath -Recurse -Force
}
New-Item -ItemType Directory -Path $tempPath | Out-Null

$includeItems = @(
  "manifest.json",
  "README.md",
  "LICENSE",
  "PRIVACY_POLICY.md",
  "TERMS.md",
  "src"
)

foreach ($item in $includeItems) {
  $src = Join-Path $projectRoot $item
  if (-not (Test-Path $src)) {
    throw "Missing required package item: $item"
  }
  Copy-Item -Path $src -Destination $tempPath -Recurse -Force
}

Compress-Archive -Path (Join-Path $tempPath "*") -DestinationPath $zipPath
Remove-Item $tempPath -Recurse -Force

Write-Host "Package created:" $zipPath
