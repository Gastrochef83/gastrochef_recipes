# =========================================================
# GastroChef — NUCLEAR ZIP BUILDER (Windows PowerShell)
# =========================================================
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Resolve-Path (Join-Path $Root "..")

Set-Location $Root

Write-Host "==> Node version"
node -v
Write-Host "==> NPM version"
npm -v

Write-Host "==> Clean install"
if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" }
npm ci

Write-Host "==> Lint (if configured)"
npm run lint --if-present

Write-Host "==> Typecheck (if configured)"
npm run typecheck --if-present

Write-Host "==> Build"
npm run build

Write-Host "==> Create ZIP (excluding node_modules/.git)"
$OutDir = Join-Path $Root "__dist"
if (!(Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$ZipName = "gastrochef_NUCLEAR_FINAL_{0}.zip" -f (Get-Date -Format "yyyyMMdd_HHmmss")
$ZipPath = Join-Path $OutDir $ZipName

# Requires PowerShell 5+ for Compress-Archive
$Exclude = @("node_modules", ".git", ".vercel", "__dist", "dist", "build")
$Items = Get-ChildItem -Path $Root -Force | Where-Object { $Exclude -notcontains $_.Name }

# Create a temp folder to stage filtered files
$Temp = Join-Path $OutDir "_stage"
if (Test-Path $Temp) { Remove-Item -Recurse -Force $Temp }
New-Item -ItemType Directory -Path $Temp | Out-Null

foreach ($it in $Items) {
  Copy-Item -Recurse -Force $it.FullName $Temp
}

if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path (Join-Path $Temp "*") -DestinationPath $ZipPath

Remove-Item -Recurse -Force $Temp

Write-Host "==> DONE: $ZipPath"
