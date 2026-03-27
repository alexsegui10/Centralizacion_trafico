param(
  [Parameter(Mandatory=$true)][string]$HostUser,
  [Parameter(Mandatory=$true)][string]$HostIp,
  [string]$RemoteDir = "~/n8n-stack"
)

$ErrorActionPreference = "Stop"

Write-Host "[1/6] Verificando archivos locales..."
$required = @(
  "scripts/setup_n8n_hostinger.sh",
  ".env.production",
  "n8n/workflows/detector_leads.json",
  "n8n/workflows/reactivacion_winback.json",
  "n8n/workflows/detector_mgo.json"
)

foreach ($f in $required) {
  if (!(Test-Path $f)) {
    throw "Falta archivo requerido: $f"
  }
}

Write-Host "[2/6] Creando estructura remota..."
ssh "$HostUser@$HostIp" "mkdir -p $RemoteDir/n8n/workflows $RemoteDir/nginx"

Write-Host "[3/6] Subiendo .env y script de setup..."
scp ".env.production" "$HostUser@$HostIp`:$RemoteDir/.env.production"
scp "scripts/setup_n8n_hostinger.sh" "$HostUser@$HostIp`:$RemoteDir/setup_n8n_hostinger.sh"

Write-Host "[4/6] Subiendo workflows..."
scp "n8n/workflows/detector_leads.json" "$HostUser@$HostIp`:$RemoteDir/n8n/workflows/detector_leads.json"
scp "n8n/workflows/reactivacion_winback.json" "$HostUser@$HostIp`:$RemoteDir/n8n/workflows/reactivacion_winback.json"
scp "n8n/workflows/detector_mgo.json" "$HostUser@$HostIp`:$RemoteDir/n8n/workflows/detector_mgo.json"
if (Test-Path "n8n/workflows/alerta_conflicto_v1.json") {
  scp "n8n/workflows/alerta_conflicto_v1.json" "$HostUser@$HostIp`:$RemoteDir/n8n/workflows/alerta_conflicto_v1.json"
} elseif (Test-Path "n8n/workflows/alerta_conflicto.json") {
  scp "n8n/workflows/alerta_conflicto.json" "$HostUser@$HostIp`:$RemoteDir/n8n/workflows/alerta_conflicto.json"
} else {
  throw "No encuentro alerta_conflicto_v1.json ni alerta_conflicto.json"
}

Write-Host "[5/6] Ejecutando setup remoto (pedira password SSH)..."
ssh "$HostUser@$HostIp" "cd $RemoteDir && chmod +x setup_n8n_hostinger.sh && APP_DIR=$RemoteDir ./setup_n8n_hostinger.sh"

Write-Host "[6/6] Verificación externa"
Write-Host "Bash/cmd: curl -i -X POST http://$HostIp`:8088/webhook/alerta -H \"Content-Type: application/json\" -d \"{\"\"event\"\":\"\"healthcheck\"\"}\""
Write-Host "PowerShell: curl.exe -i -X POST \"http://$HostIp`:8088/webhook/alerta\" -H \"Content-Type: application/json\" -d \"{\"\"event\"\":\"\"healthcheck\"\"}\""
Write-Host "Listo."
