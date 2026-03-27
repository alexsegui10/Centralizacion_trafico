$ErrorActionPreference = "Stop"

function Load-DotEnv {
  param(
    [string]$Path = ".env"
  )

  if (-not (Test-Path $Path)) {
    throw "No se encontró $Path"
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $parts = $line -split "=", 2
    if ($parts.Count -ne 2) { return }

    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"')
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

Load-DotEnv

if (-not $env:ALERT_WEBHOOK_URL) {
  $env:ALERT_WEBHOOK_URL = "http://187.124.44.194:8088/webhook/alerta"
}

Write-Host "[1/2] Health check diario..." -ForegroundColor Cyan
node scripts/health_daily.js
if ($LASTEXITCODE -ne 0) {
  throw "health_daily.js falló con código $LASTEXITCODE"
}

Write-Host "[2/2] Backup diario Supabase..." -ForegroundColor Cyan
node scripts/supabase_backup_daily.js
if ($LASTEXITCODE -ne 0) {
  throw "supabase_backup_daily.js falló con código $LASTEXITCODE"
}

Write-Host "DAILY_OPS_OK" -ForegroundColor Green
