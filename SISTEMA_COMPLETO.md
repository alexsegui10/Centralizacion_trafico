# SISTEMA_COMPLETO

## 1) Variables de negocio activas

Las 4 variables que gobiernan la automatizacion son:

- of_activo
- telegram_activo
- mgo_directo
- mgo_en_canal

## 2) Flujos oficiales (1-6)

1. Flujo 1
- Condicion: mgo_directo=true
- Accion: bot de ventas inmediato
- Winback: si inactivo 14 dias, entra en winback MGO

2. Flujo 2
- Condicion: of_activo=false, mgo_directo=false, mgo_en_canal=true
- Accion: mensaje "¿buscas algo?"
- Reactivacion: si ignora, entra en winback MGO

3. Flujo 3
- Condicion: of_activo=false, telegram_activo=true, mgo_directo=false, mgo_en_canal=false
- Accion: ventana de conversion social -> OF
- Reactivacion: CupidBot (winback social)

4. Flujo 4 (VIP)
- Condicion: of_activo=true
- Accion: apagado total de bots
- Operacion: atencion manual de modelo

5. Flujo 5 (Winback MGO)
- Condicion: of_activo=false y (mgo_directo=true o mgo_en_canal=true) y 14 dias sin actividad
- Accion: CupidBot reactivacion con historial de compras (placeholder)

6. Flujo 6 (conflicto)
- Condicion: of_activo=false y dos o mas señales simultaneas entre telegram_activo/mgo_directo/mgo_en_canal
- Accion: apagar bots y alerta inmediata para gestion manual

## 3) Arquitectura

```text
Landing (index.html + app.js)
  -> /api/proxy
     -> api-visitor (identidad)
     -> api-track (eventos + lead upsert + geolocalizacion por IP)
     -> api-invite (enlace Telegram)
     -> api-webhook-telegram (activacion Telegram)

Supabase (Postgres)
  -> leads
  -> eventos

n8n
  -> detector_leads (5m)
  -> detector_mgo (5m)
  -> reactivacion_winback (1h)
  -> alerta_conflicto (webhook)

Panel admin (admin.jsx)
  -> lectura realtime + monitoreo visual
```

## 4) Supabase: columnas de leads

Columnas clave actuales en leads:

- visitor_id
- fingerprint_hash
- modelo_id
- utm_source
- idioma
- dispositivo
- user_agent
- ip_hash
- pais
- ciudad
- of_activo
- telegram_activo
- mgo_directo
- mgo_en_canal
- invite_link
- invite_link_created_at
- telegram_user_id
- last_bot_action
- active_flow
- winback_sent
- created_at
- updated_at

### 4.1 Migraciones nuevas

- supabase/migrations/20260326121500_add_mgo_and_geo_columns.sql
- supabase/migrations/20260326121600_verify_mgo_geo_columns.sql

La migracion agrega:

- mgo_directo BOOLEAN DEFAULT FALSE
- mgo_en_canal BOOLEAN DEFAULT FALSE
- pais TEXT
- ciudad TEXT
- indices para mgo_directo, mgo_en_canal, pais y ciudad

## 5) api-track actualizado

Archivo: supabase/functions/api-track/index.ts

Cambios:

- Se mantiene hash de IP (`ip_hash`)
- Se agrega lookup geolocalizacion por IP con `ip-api.com`
- Endpoint usado: `http://ip-api.com/json/{IP}?fields=status,country,city,countryCode`
- Timeout maximo: 1 segundo
- Fallback seguro: si falla lookup, continua tracking sin error y guarda pais/ciudad como null
- `leads.upsert` ahora incluye `pais` y `ciudad`

## 6) n8n workflows

### 6.1 detector_leads (actualizado)

Archivo: n8n/workflows/detector_leads.json

- Trigger cada 5 minutos
- Detecta Flujo 6 y dispara webhook de alerta (`ALERTA_CONFLICTO_WEBHOOK`)
- Marca `active_flow='6'` para conflictos
- Flujo 3 exige explicitamente:
  - of_activo=false
  - telegram_activo=true
  - mgo_directo=false
  - mgo_en_canal=false
- Mantiene rama de trafico directo legado (Flow 2 direct) para compatibilidad

### 6.2 reactivacion_winback (actualizado)

Archivo: n8n/workflows/reactivacion_winback.json

Rama A (Flow 3 winback):
- telegram_activo=true
- of_activo=false
- mgo_directo=false
- mgo_en_canal=false
- winback_sent=false
- updated_at < 14 dias

Rama B (Flow 5 winback MGO):
- of_activo=false
- (mgo_directo=true OR mgo_en_canal=true)
- winback_sent=false
- updated_at < 14 dias

Mensajes:
- Rama A: copy social
- Rama B: copy MGO con placeholder de historial de compras

### 6.3 detector_mgo (nuevo)

Archivo: n8n/workflows/detector_mgo.json

- Trigger cada 5 minutos
- Flow 1: mgo_directo=true, of_activo=false, active_flow is null -> `active_flow='1'`
- Flow 2: mgo_directo=false, mgo_en_canal=true, of_activo=false, active_flow is null -> `active_flow='2'` + mensaje "¿buscas algo?"
- Flow 4 VIP: of_activo=true y active_flow != '4' -> `active_flow='4'` + alerta webhook

## 7) Panel admin visual

Archivo unico:

- admin.jsx

Copia de ejecucion Vite:

- admin-preview/src/AdminPanel.jsx

Secciones incluidas:

- Login por password con sessionStorage
- Dashboard visual (totales, porcentajes, conflictos, winback, conversion CupidBot)
- Origen (tabla + barras: Instagram, TikTok, Twitter, Reddit, Direct, MGO)
- Geo (top paises y top ciudades)
- Leads (tabla completa + filtros + paginacion 20)
- Flujos activos (1..6 con %)
- VIP (of_activo=true)
- Winback Telegram y Winback MGO en tablas separadas
- Eventos recientes (50)
- Rendimiento CupidBot (atendidos, conversion, tasa, tiempo medio)

## 8) Deploy de workflows actualizado

Scripts actualizados:

- scripts/setup_n8n_hostinger.sh
- scripts/deploy_to_vps.ps1

Cambios:

- incluyen importacion/subida de detector_mgo
- activan detector_mgo junto a detector_leads, reactivacion_winback y alerta

## 9) Verificacion SQL de columnas e indices

Query lista para ejecutar en Supabase SQL editor:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'leads'
  AND column_name IN ('mgo_directo', 'mgo_en_canal', 'pais', 'ciudad')
ORDER BY column_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'leads'
  AND indexname IN (
    'idx_leads_mgo_directo',
    'idx_leads_mgo_en_canal',
    'idx_leads_pais',
    'idx_leads_ciudad'
  )
ORDER BY indexname;
```

Archivo en repo:

- supabase/migrations/20260326121600_verify_mgo_geo_columns.sql

## 10) Nota operativa

No se pudo ejecutar migracion remota automaticamente desde este entorno porque la CLI de Supabase no esta instalada en la maquina (`supabase: command not found`).

El codigo y los SQL quedaron preparados y listos para aplicar/importar de inmediato.
