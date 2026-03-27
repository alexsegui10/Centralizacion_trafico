# RUNBOOK — Linktree Inteligente (Supabase Edge Functions + Deno/TypeScript)

## 1) Objetivo
Este runbook documenta cómo operar en producción el sistema de tracking con:
- Recuperación de `visitor_id` por `fingerprint_hash`
- Tracking idempotente por `request_id`
- Validación HMAC de requests
- Anti-replay de 24h
- Hash de IP en servidor (`ip_hash` SHA-256)

Funciones incluidas en este repo:
- `supabase/functions/api-proxy/index.ts` → endpoint público `/api/proxy`
- `supabase/functions/api-visitor/index.ts` → GET `/api/visitor`
- `supabase/functions/api-track/index.ts` → POST `/api/track`

---

## 2) Requisitos previos
- Supabase project creado
- Supabase CLI instalado
- Login y link del proyecto:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
```

- Variables de entorno (secrets):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `EDGE_HMAC_SECRET` (mínimo 32 chars aleatorios)

---

## 3) Base de datos
Ejecutar SQL en Supabase SQL editor (o migración) usando [schema.sql](schema.sql).

Puntos clave del schema:
- `leads.visitor_id` UNIQUE para UPSERT idempotente
- `eventos.request_id` UNIQUE para deduplicación de reintentos
- Trigger `updated_at` en `leads`

---

## 4) Deploy de Edge Functions
Desde raíz del proyecto:

```bash
supabase functions deploy api-proxy
supabase functions deploy api-visitor
supabase functions deploy api-track
```

Set de secrets (una vez por entorno):

```bash
supabase secrets set SUPABASE_URL="https://<project>.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
supabase secrets set EDGE_HMAC_SECRET="<ultra_random_secret>"
```

---

## 5) Routing público `/api/*`
Las funciones de Supabase exponen por defecto:
- `/functions/v1/api-visitor`
- `/functions/v1/api-track`
- `/functions/v1/api-proxy`

Si frontend llama `/api/proxy`, configurar rewrite/proxy en tu hosting:

- `/api/proxy` → `https://<project>.supabase.co/functions/v1/api-proxy`

Flujo recomendado:
1. Frontend llama `/api/proxy?target=visitor&fingerprint=...` y `/api/proxy?target=track`
2. `api-proxy` firma con `EDGE_HMAC_SECRET`
3. `api-proxy` reenvía a `api-visitor` / `api-track`
4. `api-visitor` y `api-track` validan HMAC siempre

---

## 6) HMAC (request signing)
## Headers requeridos
- `x-timestamp`: unix timestamp en segundos
- `x-signature`: HMAC-SHA256 hex

Nota: estos headers solo deben generarse en servidor (`api-proxy`), nunca en navegador.

## Canonical string
### GET /api/visitor
```text
GET
/api/visitor
{x-timestamp}
{fingerprint}
```

### POST /api/track
```text
POST
/api/track
{x-timestamp}
{raw_json_body_exacto}
```

**Importante:** la firma debe calcularse sobre el `raw body` exacto (sin reordenar JSON).

---

## 7) Anti-replay 24h
Implementado en ambas funciones:
- Rechaza requests con `x-timestamp` fuera de ventana de 24h
- Rechaza timestamps muy en futuro (> 5 min)

En `api-track` además:
- Valida `payload.timestamp` con ventana 24h
- Deduplica por `request_id` en DB: `ON CONFLICT (request_id) DO NOTHING`

---

## 8) Comportamiento backend
## GET /api/visitor
1. Valida HMAC
2. Busca `leads.fingerprint_hash`
3. Responde `{ visitor_id }` o `{ visitor_id: null }`

## POST /api/track
1. Valida HMAC
2. Valida payload (`request_id`, `visitor_id`, `boton_clickado`, etc.)
3. Calcula `ip_hash = SHA-256(ip_real)` en servidor
4. UPSERT idempotente en `leads` por `visitor_id`
5. INSERT deduplicado en `eventos` por `request_id`
6. Responde `{ ok: true }`

---

## 9) Checklist de verificación
- [ ] `schema.sql` aplicado correctamente
- [ ] `eventos.request_id` UNIQUE activo
- [ ] Secrets definidos
- [ ] Deploy de las 3 funciones completado (`api-proxy`, `api-visitor`, `api-track`)
- [ ] Rewrite `/api/proxy` activo
- [ ] Frontend envía `request_id` a `/api/proxy?target=track`
- [ ] `api-proxy` firma y reenvía correctamente
- [ ] Prueba de replay devuelve deduplicación efectiva

---

## 10) Pruebas rápidas (manual)
## 10.1 Visitor lookup
- Enviar `GET /api/proxy?target=visitor&fingerprint=<hash>` sin firma desde cliente
- Esperar `visitor_id` o `null`

## 10.2 Track insert y dedupe
- Enviar `POST /api/proxy?target=track` con `request_id = X`
- Reenviar exactamente el mismo payload (`request_id = X`)
- Verificar: `leads` actualizado, `eventos` solo 1 fila para `request_id = X`

---

## 11) Observabilidad recomendada
- Tasa de errores 5xx por función
- Ratio de `visitor_id` recuperados por fingerprint
- Ratio de deduplicación por `request_id`
- Latencia p95 de `/api/track` y `/api/visitor`

---

## 12) Hardening recomendado (siguiente fase)
- Rate limiting por `ip_hash` y por `visitor_id`
- Rotación de `EDGE_HMAC_SECRET`
- Versionado de firma (`x-signature-version`)
- Alertas automáticas cuando sube replay/error rate

---

## 13) Operación diaria (salud + backup Supabase)

### 13.1 Comando único (Windows PowerShell)
Desde la raíz del repo:

```powershell
.\scripts\run_daily_ops.ps1
```

Este comando:
1. Carga variables de `.env`
2. Ejecuta `scripts/health_daily.js` (smoke + webhook externo de alerta)
3. Ejecuta `scripts/supabase_backup_daily.js` (export JSON de tablas críticas)

### 13.2 Solo backup Supabase
```powershell
node scripts/supabase_backup_daily.js
```

Output por defecto:
- Carpeta: `backups/supabase`
- Archivo: `supabase_backup_<timestamp>.json`
- Retención automática: `14` días (configurable)

Variables opcionales:
- `SUPABASE_BACKUP_TABLES` (default: `leads,eventos`)
- `SUPABASE_BACKUP_DIR` (default: `backups/supabase`)
- `SUPABASE_BACKUP_PAGE_SIZE` (default: `1000`)
- `SUPABASE_BACKUP_KEEP_DAYS` (default: `14`)

### 13.3 Programar ejecución diaria (Task Scheduler)
Ejemplo para correr cada día a las 09:00:

```powershell
schtasks /Create /F /SC DAILY /ST 09:00 /TN "GEML_DailyOps" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\alexs\Desktop\geml\scripts\run_daily_ops.ps1"
```

Ver tarea:

```powershell
schtasks /Query /TN "GEML_DailyOps" /V /FO LIST
```
