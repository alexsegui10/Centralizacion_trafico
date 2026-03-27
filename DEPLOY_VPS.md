# Deploy n8n Fase 3 en VPS (Hetzner CX22)

## 1) Crear servidor
- Proveedor: Hetzner
- Plan recomendado: CX22
- SO: Ubuntu 22.04 LTS
- Abrir puertos: `22` (SSH), `5678` (n8n) y `80/443` si usarás reverse proxy con dominio.

## 2) Instalar Docker en Ubuntu
```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

## 3) Copiar archivos del proyecto
Sube estos archivos al VPS (por ejemplo a `/opt/geml`):
- `docker-compose.yml`
- `.env` (creado desde `.env.example`)
- `n8n/workflows/detector_leads.json`
- `n8n/workflows/reactivacion_winback.json`
- `n8n/workflows/alerta_conflicto.json`

Ejemplo con `scp` desde local:
```bash
scp -r docker-compose.yml .env n8n user@TU_VPS_IP:/opt/geml
```

## 4) Configurar variables para producción
En `/opt/geml/.env`:
- `N8N_HOST=tu-dominio.com`
- `N8N_PROTOCOL=https`
- `N8N_EDITOR_BASE_URL=https://tu-dominio.com`
- `N8N_WEBHOOK_BASE_URL=https://tu-dominio.com`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_CHANNEL_ID=...`
- `WEBHOOK_URL=...` (Twilio/Evolution para alerta)

## 5) Levantar n8n
```bash
cd /opt/geml
docker compose pull
docker compose up -d
docker compose ps
```

## 6) Importar workflows
1. Entra a `https://tu-dominio.com` (o `http://TU_IP:5678` en desarrollo).
2. Importa los JSON desde `n8n/workflows/`.
3. Activa cada workflow cuando termines validación.

## 7) Verificación rápida
```bash
docker compose logs -f n8n
```
Checks esperados:
- n8n arranca en `0.0.0.0:5678`.
- Webhook `/webhook/alerta` responde `200`.
- Workflows de schedule aparecen activos cuando los enciendas.

## 8) Actualización de versión
```bash
cd /opt/geml
docker compose pull
docker compose up -d
```
