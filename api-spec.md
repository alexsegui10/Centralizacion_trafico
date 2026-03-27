# API Spec

## Flujo público recomendado (frontend)

El navegador NO firma requests. El frontend llama solo a `api-proxy`:

- `GET /api/proxy?target=visitor&fingerprint=HASH`
- `POST /api/proxy?target=track`

`api-proxy` firma en servidor con `EDGE_HMAC_SECRET` y reenvía internamente a:

- `GET /api/visitor?fingerprint=HASH`
- `POST /api/track`

---

## GET /api/proxy?target=visitor&fingerprint=HASH

Lookup de visitante vía proxy firmado en servidor.

### Request
- Method: `GET`
- Query params requeridos: `target=visitor`, `fingerprint`

Ejemplo:

`GET /api/proxy?target=visitor&fingerprint=5d8f8a5f9a2f7ef4fbb3a7a2a3f1ea6ec6fdb6a748ccda7d0f51a2f46d01a123`

### Response 200 (encontrado)
```json
{
  "visitor_id": "9fd5989f-04ba-49d9-a9f4-08ef1f0c7c7e"
}
```

### Response 200 (no encontrado)
```json
{
  "visitor_id": null
}
```

---

## POST /api/proxy?target=track

Tracking vía proxy firmado en servidor.

### Request
- Method: `POST`
- Header: `Content-Type: application/json`

Body esperado:
```json
{
  "request_id": "a81e6078-5427-4af0-a6ba-a0f108c4f6f7",
  "visitor_id": "9fd5989f-04ba-49d9-a9f4-08ef1f0c7c7e",
  "fingerprint_hash": "5d8f8a5f9a2f7ef4fbb3a7a2a3f1ea6ec6fdb6a748ccda7d0f51a2f46d01a123",
  "utm_source": "instagram",
  "idioma": "es",
  "dispositivo": "mobile",
  "user_agent": "Mozilla/5.0 ...",
  "ip_hash": null,
  "boton_clickado": "onlyfans",
  "modelo_id": "MODEL_ID_PLACEHOLDER",
  "timestamp": "2026-03-25T12:00:00.000Z"
}
```

### Response 200
```json
{
  "ok": true
}
```

---

## Endpoints internos firmados (solo server-to-server)

## GET /api/visitor?fingerprint=HASH

Busca un visitante existente por `fingerprint_hash` en la tabla `leads`.

### Request
- Method: `GET`
- Query param requerido: `fingerprint`
- Headers requeridos: `x-timestamp`, `x-signature`

Ejemplo:

`GET /api/visitor?fingerprint=5d8f8a5f9a2f7ef4fbb3a7a2a3f1ea6ec6fdb6a748ccda7d0f51a2f46d01a123`

### Backend behavior
1. Validar que `fingerprint` existe y tiene formato válido.
2. Buscar en `leads` por `fingerprint_hash = fingerprint`.
3. Si existe fila, devolver su `visitor_id`.
4. Si no existe, devolver `visitor_id: null`.

### Response 200 (encontrado)
```json
{
  "visitor_id": "9fd5989f-04ba-49d9-a9f4-08ef1f0c7c7e"
}
```

### Response 200 (no encontrado)
```json
{
  "visitor_id": null
}
```

---

## POST /api/track

Recibe evento de clic y actualiza estado agregado en `leads`, además de registrar evento en `eventos`.

### Request
- Method: `POST`
- Header: `Content-Type: application/json`
- Headers requeridos: `x-timestamp`, `x-signature`

Body esperado:
```json
{
  "request_id": "a81e6078-5427-4af0-a6ba-a0f108c4f6f7",
  "visitor_id": "9fd5989f-04ba-49d9-a9f4-08ef1f0c7c7e",
  "fingerprint_hash": "5d8f8a5f9a2f7ef4fbb3a7a2a3f1ea6ec6fdb6a748ccda7d0f51a2f46d01a123",
  "utm_source": "instagram",
  "idioma": "es",
  "dispositivo": "mobile",
  "user_agent": "Mozilla/5.0 ...",
  "ip_hash": null,
  "boton_clickado": "onlyfans",
  "modelo_id": "MODEL_ID_PLACEHOLDER",
  "timestamp": "2026-03-25T12:00:00.000Z"
}
```

### Backend behavior
1. Validar payload (campos requeridos y tipos).
2. Obtener IP real del request y calcular `ip_hash = SHA-256(ip)`.
3. Hacer UPSERT en `leads` por `visitor_id`:
   - Si no existe: insertar fila base con metadata.
   - Si existe: actualizar metadata (`utm_source`, `idioma`, `dispositivo`, `user_agent`, `fingerprint_hash`, `ip_hash`, `updated_at`).
4. Insertar en `eventos` con deduplicacion por `request_id`:
  - `INSERT ... ON CONFLICT (request_id) DO NOTHING`
  - Si llega el mismo evento por reintento, no se duplica.
5. Opcional (regla de negocio backend): si `boton_clickado` es `onlyfans` o `telegram`, actualizar flags de estado cuando corresponda por lógica de conversión.

### Response 200
```json
{
  "ok": true
}
```

### Response 400 (ejemplo)
```json
{
  "ok": false,
  "error": "invalid_payload"
}
```
