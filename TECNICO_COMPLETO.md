# TECNICO_COMPLETO

## 1) Arquitectura general

Sistema de captación y automatización compuesto por 4 capas:

1. **Frontend estático (Link in bio)**
   - Captura `utm_source`, idioma, dispositivo, fingerprint y clics.
   - Solicita `visitor_id` y link de invitación vía `api-proxy`.
   - Envía tracking idempotente (`request_id` UUID).

2. **Supabase Edge Functions (gateway + lógica backend)**
   - `api-proxy`: único endpoint público del frontend para visitor/track/invite/telegram-webhook.
   - Firma HMAC hacia funciones internas y centraliza validaciones de entrada.

3. **Supabase (Postgres + REST API)**
   - Tabla `leads`: estado vivo de cada visitante.
   - Tabla `eventos`: historial de eventos idempotente por `request_id`.

4. **n8n en VPS + Nginx**
   - Workflows activos (producción): detector, winback, alerta.
   - Nginx expone webhook público `/webhook/alerta` y enruta internamente a n8n.

---

## 2) Stack completo con versiones exactas

### Frontend
- HTML/CSS/JS vanilla (sin framework).
- Archivos principales: `index.html`, `styles.css`, `app.js`, `config.js`.

### Backend serverless
- Supabase Edge Functions (TypeScript sobre runtime Deno de Supabase).
- Cliente DB: `@supabase/supabase-js@2` (importado vía `https://esm.sh/@supabase/supabase-js@2`).

### Orquestación y automatización
- n8n: **1.85.4**
  - Evidencia: `docker-compose.yml` y `/rest/settings` (`versionCli: 1.85.4`).
- Docker Compose plugin (instalado por script VPS).
- Base de datos n8n: **SQLite** (evidencia en `/rest/settings`).

### Reverse proxy
- Imagen: `nginx:1.27-alpine` (script de despliegue VPS).
- Runtime observado en cabecera HTTP: `nginx/1.27.5`.

### Infra
- VPS Ubuntu 24.04 (Hostinger, despliegue automatizado por `scripts/setup_n8n_hostinger.sh`).

---

## 3) Edge Functions — resumen exhaustivo

## 3.1 `api-proxy`
**Archivo:** `supabase/functions/api-proxy/index.ts`

### Objetivo
Gateway público para frontend. Enruta por `target` y firma internamente con HMAC cuando corresponde.

### Rutas soportadas
- `GET ?target=visitor&fingerprint=...` → reenvía a `api-visitor`.
- `POST ?target=track` → reenvía a `api-track`.
- `POST ?target=invite` → reenvía a `api-invite`.
- `POST ?target=telegram-webhook` → reenvía a `api-webhook-telegram`.

### Inputs
- Query `target`.
- Body JSON para `track`, `invite`, `telegram-webhook`.

### Outputs esperados
- Replica `status` y body de la función upstream.

### Errores posibles
- `400 missing_fingerprint`.
- `400 missing_body`.
- `400 invalid_target_or_method`.
- `500 internal_error`.

---

## 3.2 `api-visitor`
**Archivo:** `supabase/functions/api-visitor/index.ts`

### Objetivo
Resolver `visitor_id` por `fingerprint_hash`.

### Input
- Método `GET`.
- Query `fingerprint`.
- Headers HMAC: `x-timestamp`, `x-signature`.

### Lógica principal
1. Valida método y fingerprint.
2. Valida HMAC + anti-replay (24h).
3. Consulta `leads` por `fingerprint_hash`.
4. Devuelve primer `visitor_id` o `null`.

### Output
- `200 { visitor_id: <string|null> }`.

### Errores posibles
- `405 method_not_allowed`.
- `400 missing_fingerprint`.
- `401 missing_hmac_headers | invalid_hmac_timestamp | timestamp_in_future | signature_expired | invalid_signature`.
- `500 lookup_failed`.
- `500 internal_error`.

---

## 3.3 `api-track`
**Archivo:** `supabase/functions/api-track/index.ts`

### Objetivo
Registrar interacción de botones (`telegram`/`onlyfans`) con idempotencia y upsert de lead.

### Input
- Método `POST`.
- Body JSON:
  - `request_id` (UUID requerido)
  - `visitor_id` (string requerido)
  - `fingerprint_hash` (nullable)
  - `utm_source`, `idioma`, `dispositivo`, `user_agent`
  - `boton_clickado` (`onlyfans`|`telegram`)
  - `modelo_id` (requerido)
  - `timestamp` ISO (ventana <=24h)
- Headers HMAC requeridos.

### Lógica principal
1. Valida HMAC y ventana temporal.
2. Valida JSON y estructura de payload.
3. Obtiene IP real y calcula `ip_hash` SHA-256 en servidor.
4. Upsert en `leads` por `visitor_id`.
5. Upsert en `eventos` por `request_id` con `ignoreDuplicates`.

### Output
- `200 { ok: true }`.

### Errores posibles
- `405 method_not_allowed`.
- `400 invalid_json | invalid_request_id | invalid_visitor_id | invalid_modelo_id | invalid_boton_clickado | invalid_timestamp | timestamp_in_future | timestamp_too_old`.
- `401` errores de HMAC.
- `500 lead_upsert_failed | event_insert_failed | internal_error`.

---

## 3.4 `api-invite`
**Archivo:** `supabase/functions/api-invite/index.ts`

### Objetivo
Crear/reutilizar invite link de Telegram por `visitor_id`.

### Input
- Método `POST`.
- Body JSON: `visitor_id`, `modelo_id`.
- Headers HMAC requeridos.

### Lógica principal
1. Valida HMAC y body.
2. Busca `invite_link` existente en `leads`.
3. Si existe: devuelve el mismo (`reused: true`).
4. Si no existe: crea invite con Telegram API y guarda en `leads`.

### Output
- `200 { invite_link, reused }`.

### Errores posibles
- `405 method_not_allowed`.
- `400 invalid_json | missing_visitor_id | missing_modelo_id`.
- `401` errores de HMAC.
- `500 lookup_failed | upsert_failed | internal_error`.
- Error Telegram encapsulado como `telegram_invite_error:*`.

---

## 3.5 `api-webhook-telegram`
**Archivo:** `supabase/functions/api-webhook-telegram/index.ts`

### Objetivo
Procesar alta de miembro vía invite de Telegram y marcar lead activo en Telegram.

### Input
- Método `POST`.
- Header `X-Telegram-Bot-Api-Secret-Token`.
- Body update Telegram (chat_member).

### Lógica principal
1. Valida secret.
2. Parsea update.
3. Solo procesa eventos con `new_chat_member.status == member` y con `invite_link`.
4. Busca lead por `invite_link`.
5. Actualiza `telegram_activo=true` y `telegram_user_id`.

### Output
- `200 { ok: true, ignored: true }` cuando no aplica o invite desconocido.
- `200 { ok: true, visitor_id, telegram_activo: true, telegram_user_id }` cuando actualiza.

### Errores posibles
- `405 method_not_allowed`.
- `401 invalid_telegram_secret`.
- `400 invalid_json`.
- `500 lead_lookup_failed | lead_update_failed | internal_error`.

---

## 3.6 `_shared/security.ts`
**Archivo:** `supabase/functions/_shared/security.ts`

### Funciones clave
- CORS centralizado.
- `jsonResponse`, `handleOptions`.
- `getRequiredEnv`.
- `getClientIp` (`x-forwarded-for`, `cf-connecting-ip`, `x-real-ip`).
- `sha256Hex`.
- `createHmacSignature`.
- `validateHmacRequest` con:
  - `maxAgeSeconds` (24h en este sistema).
  - tolerancia futuro (`allowFutureSkewSeconds`, default 300s).
  - comparación timing-safe.

---

## 4) Schema Supabase completo

Fuentes: migraciones
- `supabase/migrations/20260325170000_init_tracking_schema.sql`
- `supabase/migrations/20260325183000_add_invite_link_columns.sql`
- `supabase/migrations/20260325193000_add_phase3_lead_columns.sql`

## 4.1 Tabla `leads`

| Columna | Tipo | Propósito |
|---|---|---|
| `id` | UUID PK | Identificador interno de fila |
| `visitor_id` | TEXT UNIQUE | Identidad estable del visitante (clave funcional principal) |
| `fingerprint_hash` | TEXT | Hash del fingerprint de dispositivo/navegador |
| `modelo_id` | TEXT | Identificador de modelo/landing |
| `utm_source` | TEXT | Fuente de tráfico (instagram, tiktok, direct, etc.) |
| `idioma` | TEXT | Idioma detectado del usuario |
| `dispositivo` | TEXT | Tipo de dispositivo (mobile/tablet/desktop) |
| `user_agent` | TEXT | User agent capturado |
| `ip_hash` | TEXT | Hash SHA-256 de IP (no IP en claro) |
| `of_activo` | BOOLEAN default false | Señal de actividad/compra en OF |
| `telegram_activo` | BOOLEAN default false | Confirmación de que entró al canal Telegram |
| `invite_link` | TEXT nullable | Invite link asignado por Telegram |
| `invite_link_created_at` | TIMESTAMPTZ nullable | Fecha de creación del invite |
| `last_bot_action` | TIMESTAMPTZ nullable | Último envío automático del bot |
| `active_flow` | TEXT nullable | Flujo de mensajería activo (ej. 2,3) |
| `winback_sent` | BOOLEAN default false | Marca de reactivación enviada |
| `telegram_user_id` | TEXT nullable | ID de usuario de Telegram |
| `created_at` | TIMESTAMPTZ default now() | Fecha creación |
| `updated_at` | TIMESTAMPTZ default now() | Fecha actualización (trigger) |

Índices/constraints relevantes:
- `UNIQUE(visitor_id)`.
- índice `idx_leads_fingerprint`.
- trigger `leads_updated_at`.

## 4.2 Tabla `eventos`

| Columna | Tipo | Propósito |
|---|---|---|
| `id` | UUID PK | Identificador interno del evento |
| `request_id` | TEXT UNIQUE | Idempotencia de eventos (evita duplicados) |
| `visitor_id` | TEXT | Relación lógica al lead |
| `modelo_id` | TEXT | Modelo relacionado |
| `boton_clickado` | TEXT | Acción (`telegram` o `onlyfans`) |
| `utm_source` | TEXT | Fuente de adquisición |
| `idioma` | TEXT | Idioma en el momento del click |
| `dispositivo` | TEXT | Dispositivo en el momento del click |
| `user_agent` | TEXT | User agent del evento |
| `fingerprint_hash` | TEXT | Huella asociada al evento |
| `created_at` | TIMESTAMPTZ default now() | Fecha del evento |

Índices/constraints relevantes:
- `UNIQUE(request_id)`.
- índice `idx_eventos_visitor`.

---

## 5) Workflows n8n (nodo por nodo)

> Nota: los JSON exportados (`n8n/workflows/*.json`) pueden aparecer con `active:false`; la activación real en VPS se gestiona por CLI en despliegue.

## 5.1 `detector_leads`
**Objetivo:** detectar leads calientes recién activos en Telegram y disparar mensaje según tipo de tráfico.

Nodos:
1. `Every 5 Minutes` (schedule trigger cada 5 min).
2. `Build 5m Cutoff` (code): calcula `cutoff = now - 5min`.
3. `Fetch Eligible Leads` (HTTP GET Supabase REST `leads`):
   - Filtros: `telegram_activo=true`, `of_activo=false`, `updated_at > cutoff`, `active_flow is null`, `telegram_user_id not null`.
4. `Array to Items` (code): normaliza respuesta array/body.
5. `Is Cold Traffic` (if): `utm_source in [instagram,tiktok,twitter,reddit]`.
6. `Is Direct` (if): `utm_source == direct`.
7. `Send Telegram Flow 3` (HTTP POST Telegram `sendMessage`) para tráfico frío.
8. `Update Lead Flow 3` (HTTP PATCH Supabase `leads`):
   - Escribe `last_bot_action=now`, `active_flow='3'`.
9. `Send Telegram Flow 2` para tráfico directo.
10. `Update Lead Flow 2` (PATCH Supabase):
   - Escribe `last_bot_action=now`, `active_flow='2'`.

Escrituras en DB:
- `leads.last_bot_action`, `leads.active_flow`.

---

## 5.2 `reactivacion_winback`
**Objetivo:** reactivar leads con 14+ días sin actividad/oferta, solo una vez.

Nodos:
1. `Every Hour` (schedule trigger cada hora).
2. `Build 14d Cutoff` (code): `cutoff = now - 14 días`.
3. `Fetch Winback Leads` (GET Supabase REST `leads`):
   - Filtros: `telegram_activo=true`, `of_activo=false`, `winback_sent=false`, `updated_at < cutoff`, `telegram_user_id not null`.
4. `Array to Items` (code): normaliza array/body.
5. `Send Winback Telegram` (POST Telegram `sendMessage`).
6. `Mark Winback Sent` (PATCH Supabase `leads`):
   - Escribe `winback_sent=true`, `updated_at=now`.

Escrituras en DB:
- `leads.winback_sent`, `leads.updated_at`.

---

## 5.3 `alerta_conflicto` / `alerta_conflicto_v1`

### Variante completa (`alerta_conflicto`)
1. `Webhook /alerta` (POST path `alerta`).
2. `Send WhatsApp Alert` (POST a `$env.WEBHOOK_URL` con payload envoltorio).
3. `Respond 200` (responde `{ok:true}`).

### Variante mínima (`alerta_conflicto_v1`)
- Solo `Webhook` y respuesta inmediata `onReceived`.

Despliegue actual:
- Script VPS prioriza importar `alerta_conflicto_v1.json` si existe; si no, usa `alerta_conflicto.json`.

---

## 6) Secrets y variables — ubicación y rotación

## 6.1 Supabase Edge Functions (secrets de plataforma)
Viven en `supabase secrets`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EDGE_HMAC_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHANNEL_ID`
- `TELEGRAM_WEBHOOK_SECRET`

Rotación sugerida:
1. Generar nuevo secreto.
2. Cargar con `supabase secrets set ...`.
3. Redeploy de funciones.
4. Probar smoke.
5. Invalidar secreto anterior.

Comandos:
```bash
supabase secrets set EDGE_HMAC_SECRET="<nuevo>"
supabase functions deploy api-proxy
supabase functions deploy api-visitor
supabase functions deploy api-track
supabase functions deploy api-invite
supabase functions deploy api-webhook-telegram
```

## 6.2 VPS / n8n
Viven en `~/<stack>/.env.production` (en despliegue, `APP_DIR`):
- `N8N_HOST`, `N8N_PROTOCOL`, `N8N_EDITOR_BASE_URL`, `N8N_WEBHOOK_BASE_URL`
- `N8N_ENCRYPTION_KEY`, `GENERIC_TIMEZONE`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`
- `WEBHOOK_URL`

Rotación sugerida:
1. Editar `.env.production`.
2. `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`
3. Verificar `docker logs n8n --tail 100`.

---

## 7) Puntos de fallo conocidos + recuperación

## 7.1 `422 Failed to parse request body` en `/webhook/alerta`
**Causa:** JSON mal escapado desde PowerShell/curl.

**Recuperación:** usar cliente seguro (`Invoke-RestMethod` o Node fetch con `JSON.stringify`).

## 7.2 `404 webhook not registered`
**Causa:** workflow de alerta inactivo o path real con prefijo ID en n8n.

**Recuperación:**
1. Activar workflow correcto.
2. Validar proxy Nginx apunta al ID activo.
3. `docker exec n8n n8n list:workflow --active=true`.

## 7.3 detector/winback no actualiza lead
**Causa típica:** referencia de contexto incorrecta en nodo PATCH (array/body mismatch).

**Recuperación:** usar mapping robusto (`Array to Items`) y referencia explícita del nodo fuente.

## 7.4 duplicados de workflows en n8n
**Causa:** reimportaciones sucesivas.

**Recuperación:**
1. Mantener un activo por tipo.
2. Limpiar legacy en CLI/DB si aplica.

## 7.5 n8n no arranca estable tras deploy
**Causas:** permisos `n8n_data`, env inválidas, Docker daemon.

**Recuperación:**
```bash
docker info
docker logs --tail 120 n8n
sudo chown -R 1000:1000 ~/n8n-stack/n8n_data
sudo chmod -R 775 ~/n8n-stack/n8n_data
```

---

## 8) Comandos de mantenimiento más usados

## 8.1 Salud diaria + backup
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run_daily_ops.ps1
```

## 8.2 Smoke funcional
```bash
node scripts/smoke_daily.js
```

## 8.3 Backup Supabase
```bash
node scripts/supabase_backup_daily.js
```

## 8.4 Ver endpoints n8n públicos
```bash
curl -i http://<VPS_IP>:8088/rest/settings
curl -i -X POST http://<VPS_IP>:8088/webhook/alerta -H "Content-Type: application/json" -d '{"event":"healthcheck"}'
```

## 8.5 Operación n8n en VPS
```bash
docker ps
docker logs --tail 150 n8n
docker logs --tail 150 n8n-nginx
docker exec n8n n8n list:workflow --active=true
docker exec n8n n8n update:workflow --id=<ID> --active=true
```

## 8.6 Redeploy VPS automatizado (desde local)
```powershell
.\scripts\deploy_to_vps.ps1 -HostUser root -HostIp <VPS_IP>
```

---

## 9) Estado técnico actual (última auditoría)

- n8n accesible externamente y operativo (`/` y `/rest/settings` = 200).
- `POST /webhook/alerta` responde 200.
- Endpoints internos protegidos (`/rest/workflows` sin sesión = 401).
- Smoke diario en verde (`PASS` en todos los checks).
- Backups Supabase diarios generándose en `backups/supabase`.

---

## 10) Recomendaciones antes de producción real

1. Forzar HTTPS real con dominio y TLS (sin IP directa en producción).
2. Activar auth de n8n editor (si no está ya forzada en servidor final).
3. Revisar y rotar secrets de prueba.
4. Revisar mensajes placeholder de Telegram (Flow 2/3/winback) con copy final.
5. Definir política de retención y copia externa de backups (S3/B2/Drive).
