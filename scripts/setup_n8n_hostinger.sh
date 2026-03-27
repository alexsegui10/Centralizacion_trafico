#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/n8n-stack}"
ENV_FILE="$APP_DIR/.env.production"
WORKFLOWS_DIR="$APP_DIR/n8n/workflows"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
NGINX_CONF="$APP_DIR/nginx/default.conf"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[ERROR] No existe $ENV_FILE"
  exit 1
fi

echo "[1/8] Instalando Docker oficial..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "[1b/8] Arrancando Docker daemon..."
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl enable docker || true
  sudo systemctl start docker || true
fi

if ! docker info >/dev/null 2>&1; then
  if command -v service >/dev/null 2>&1; then
    sudo service docker start || true
  fi
fi

if ! docker info >/dev/null 2>&1; then
  echo "[ERROR] Docker no está levantado."
  echo "Revisa en el VPS: systemctl status docker --no-pager || service docker status"
  echo "Y logs: journalctl -xeu docker.service --no-pager | tail -n 120"
  exit 1
fi

sudo usermod -aG docker "$USER" || true

mkdir -p "$APP_DIR" "$APP_DIR/n8n_data" "$APP_DIR/nginx" "$WORKFLOWS_DIR"
sudo chown -R 1000:1000 "$APP_DIR/n8n_data" || true
sudo chmod -R 775 "$APP_DIR/n8n_data" || true

if [[ ! -f "$COMPOSE_FILE" ]]; then
cat > "$COMPOSE_FILE" <<'YAML'
services:
  n8n:
    image: n8nio/n8n:1.85.4
    container_name: n8n
    restart: unless-stopped
    env_file: .env.production
    ports:
      - "127.0.0.1:5678:5678"
    volumes:
      - ./n8n_data:/home/node/.n8n
      - ./n8n/workflows:/workflows

  nginx:
    image: nginx:1.27-alpine
    container_name: n8n-nginx
    restart: unless-stopped
    depends_on:
      - n8n
    ports:
      - "8088:80"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
YAML
fi

cd "$APP_DIR"

echo "[2/8] Levantando n8n..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d n8n

echo "[2b/8] Esperando a que n8n esté estable..."
READY=0
for i in $(seq 1 45); do
  if docker ps --filter "name=^/n8n$" --filter "status=running" -q | grep -q .; then
    if docker exec n8n n8n --version >/dev/null 2>&1; then
      READY=1
      break
    fi
  fi
  sleep 2
done

if [[ "$READY" -ne 1 ]]; then
  echo "[ERROR] n8n no quedó estable (running/ready)."
  echo "--- docker ps ---"
  docker ps --filter "name=^/n8n$" --no-trunc || true
  echo "--- docker logs n8n (últimas 120 líneas) ---"
  docker logs --tail 120 n8n || true
  echo "Tip: suele ser permisos de n8n_data o variables inválidas en .env.production"
  exit 1
fi

echo "[3/8] Importando workflows..."

import_if_missing() {
  local workflow_name="$1"
  local workflow_file="$2"
  local existing
  existing=$(docker exec n8n n8n list:workflow | awk -F'|' -v n="$workflow_name" '$2==n {print $1; exit}')
  if [[ -n "$existing" ]]; then
    echo "[SKIP] $workflow_name ya existe (ID: $existing). No se reimporta."
  else
    echo "[IMPORT] $workflow_name"
    docker exec n8n n8n import:workflow --input="$workflow_file"
  fi
}

if [[ -f "$WORKFLOWS_DIR/detector_leads.json" ]]; then
  import_if_missing "detector_leads" "/workflows/detector_leads.json"
fi
if [[ -f "$WORKFLOWS_DIR/reactivacion_winback.json" ]]; then
  import_if_missing "reactivacion_winback" "/workflows/reactivacion_winback.json"
fi
if [[ -f "$WORKFLOWS_DIR/detector_mgo.json" ]]; then
  import_if_missing "detector_mgo" "/workflows/detector_mgo.json"
fi
if [[ -f "$WORKFLOWS_DIR/alerta_conflicto_v1.json" ]]; then
  import_if_missing "alerta_conflicto_v1" "/workflows/alerta_conflicto_v1.json"
elif [[ -f "$WORKFLOWS_DIR/alerta_conflicto.json" ]]; then
  import_if_missing "alerta_conflicto" "/workflows/alerta_conflicto.json"
else
  echo "[ERROR] Falta workflow de alerta (alerta_conflicto_v1.json o alerta_conflicto.json)"
  exit 1
fi

echo "[4/8] Detectando IDs de workflows..."
LIST=$(docker exec n8n n8n list:workflow)
DETECTOR_ID=$(echo "$LIST" | awk -F'|' '/detector_leads$/ {print $1; exit}')
WINBACK_ID=$(echo "$LIST" | awk -F'|' '/reactivacion_winback$/ {print $1; exit}')
DETECTOR_MGO_ID=$(echo "$LIST" | awk -F'|' '/detector_mgo$/ {print $1; exit}')
ALERTA_ID=$(echo "$LIST" | awk -F'|' '/alerta_conflicto_v1$|alerta_conflicto$/ {print $1; exit}')

if [[ -z "$DETECTOR_ID" || -z "$WINBACK_ID" || -z "$DETECTOR_MGO_ID" || -z "$ALERTA_ID" ]]; then
  echo "[ERROR] No se pudieron detectar todos los workflows requeridos."
  echo "$LIST"
  exit 1
fi

echo "[5/8] Activando solo 1 workflow por tipo..."
docker exec n8n n8n update:workflow --all --active=false || true
docker exec n8n n8n update:workflow --id="$DETECTOR_ID" --active=true
docker exec n8n n8n update:workflow --id="$WINBACK_ID" --active=true
docker exec n8n n8n update:workflow --id="$DETECTOR_MGO_ID" --active=true
docker exec n8n n8n update:workflow --id="$ALERTA_ID" --active=true

echo "[6/8] Configurando Nginx proxy para /webhook/alerta..."
cat > "$NGINX_CONF" <<EOF
server {
  listen 80;
  server_name _;

  location = /webhook/alerta {
    proxy_pass http://n8n:5678/webhook/${ALERTA_ID}/webhook/alerta;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location / {
    proxy_pass http://n8n:5678;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF

echo "[7/8] Reiniciando servicios..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d nginx
docker restart n8n
sleep 4

echo "[8/8] Estado final"
docker exec n8n n8n list:workflow --active=true

echo ""
echo "OK: Despliegue finalizado"
echo "Webhook externo: http://$(hostname -I | awk '{print $1}'):8088/webhook/alerta"
echo "Verificación (Linux/macOS): curl -i -X POST http://$(hostname -I | awk '{print $1}'):8088/webhook/alerta -H 'Content-Type: application/json' -d '{\"event\":\"healthcheck\"}'"
