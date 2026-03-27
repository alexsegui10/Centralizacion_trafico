# GUIA_NEGOCIO

## 1) Qué hace el sistema en la práctica, día a día

Este sistema trabaja solo para:

- Captar personas que llegan desde Instagram/TikTok/otros canales.
- Guardar un identificador único de cada persona para no perder su historial.
- Darles un enlace de Telegram personalizado para medir entrada real al canal.
- Registrar cada clic importante (Telegram y OnlyFans).
- Activar mensajes automáticos según comportamiento.
- Detectar casos especiales y enviar alertas.

En resumen: convierte tráfico en contactos medibles, los segmenta y activa acciones sin trabajo manual constante.

---

## 2) Recorrido real de un cliente (de Instagram al canal)

1. **La persona ve el perfil en Instagram** y entra al link.
2. **Se carga la página** y el sistema detecta:
   - origen de tráfico,
   - idioma,
   - tipo de dispositivo,
   - huella técnica para reconocerle si vuelve.
3. **Se le asigna (o recupera) un ID de visitante**.
4. **Se crea o reutiliza un link de invitación de Telegram** exclusivo para esa persona.
5. **La persona toca botón Telegram u OnlyFans**:
   - se registra el evento,
   - se evita duplicado si hay reintento.
6. **Si entra al canal Telegram**, Telegram avisa al webhook:
   - el sistema marca ese cliente como `telegram_activo=true`.
7. **A partir de ahí**, n8n decide qué automatización aplicar según reglas.

---

## 3) Qué pasa automáticamente sin que hagas nada

Automático hoy:

- Recuperación de visitante antiguo por huella.
- Registro de eventos con deduplicación.
- Creación/reuso de invite link Telegram.
- Marcado automático cuando alguien entra al canal.
- Detector cada 5 minutos para leads recientes:
  - tráfico frío → flujo de mensaje 3,
  - tráfico directo → flujo de mensaje 2.
- Winback cada hora para inactivos de 14 días.
- Alerta de conflicto por webhook de n8n.
- Health check diario + backup diario de base de datos.

---

## 4) Qué pasa cuando alguien lleva 14 días sin comprar

Si la persona:

- sigue activa en Telegram,
- no está marcada como activa en OF,
- no recibió winback antes,
- y lleva 14+ días sin actualización útil,

el sistema envía un mensaje automático de reactivación y marca ese lead como `winback_sent=true` para no repetirlo en bucle.

---

## 5) Qué pasa cuando hay conflicto o algo raro

Existe un webhook de alerta (`/webhook/alerta`) que permite disparar una alerta inmediata.

En operación real, esto sirve para:

- avisos de integraciones externas,
- inconsistencias de flujo,
- eventos que quieres elevar rápido al equipo.

Si llega una alerta, el workflow la procesa y puede reenviarla al canal/sistema que definas (por ejemplo WhatsApp webhook).

---

## 6) Qué información guardas de cada cliente en Supabase y para qué sirve

Por cada visitante/leads guardas, entre otras cosas:

- **ID de visitante**: unir todo su historial.
- **Origen (`utm_source`)**: saber qué canal trae mejor tráfico.
- **Idioma y dispositivo**: adaptar mensajes y análisis.
- **Estado Telegram/OF**: saber en qué etapa está.
- **Link de invitación**: conectar entrada real al canal con la persona.
- **Flujo activo / última acción bot**: controlar automatizaciones.
- **Winback enviado**: evitar spam.
- **Eventos por click con `request_id`**: trazabilidad sin duplicados.

Con esto puedes medir embudo real: llegada → click → entrada Telegram → activación → reactivación.

---

## 7) Problemas que pueden pasar en producción real y cómo los notarías

1. **Webhook de alerta no responde**
   - Señal: `404` o `422` en pruebas.
   - Qué notarías: no salen alertas aunque haya eventos.

2. **Workflow desactivado o duplicado incorrecto**
   - Señal: n8n activo pero no envía mensajes esperados.
   - Qué notarías: leads marcados en Telegram pero sin avance de flujo.

3. **Secrets vencidos o mal configurados**
   - Señal: errores `401` o fallos silenciosos en integraciones.
   - Qué notarías: caídas puntuales en invite/webhook/track.

4. **Problemas de VPS (Docker/permisos/espacio)**
   - Señal: contenedores reiniciando o caídos.
   - Qué notarías: interrupción total o parcial de automatización.

5. **Mensajes de bot placeholder no finales**
   - Señal: copy genérico en envíos.
   - Qué notarías: peor conversión o experiencia poco pulida.

---

## 8) Qué falta construir y qué cambia cuando esté listo

## Fase 4 — CupidBot
Pendiente principal:
- Reemplazar placeholders por conversación inteligente real (reglas + contexto + estado de conversación).

Qué cambiará:
- Mayor personalización de mensajes.
- Continuidad de conversación (no solo disparos puntuales).
- Mejor conversión de Telegram hacia objetivo comercial.

## Fase 5 — OF (OnlyFans)
Pendiente principal:
- Integración completa del estado de pago/actividad OF para cerrar el loop de monetización.

Qué cambiará:
- Medición real de conversión a pago.
- Automatizaciones condicionadas por compra/no compra.
- Winback más inteligente por valor de cliente.

---

## 9) Checklist final — antes de lanzar con tráfico real

### Marca/negocio
- [ ] Sustituir `MODEL_ID_PLACEHOLDER`, nombre, fotos, enlaces reales y copy final.
- [ ] Revisar textos de flujos 2/3/winback (sin placeholders).
- [ ] Definir qué significa exactamente `of_activo=true` en operación.

### Seguridad
- [ ] Rotar todos los secrets usados en pruebas.
- [ ] Confirmar `TELEGRAM_WEBHOOK_SECRET` real en producción.
- [ ] Verificar acceso al editor n8n restringido (no público sin auth).
- [ ] Publicar con HTTPS + dominio propio (evitar IP pública sin TLS).

### Operación
- [ ] Confirmar 1 solo workflow activo por tipo (detector, winback, alerta).
- [ ] Ejecutar `run_daily_ops.ps1` y guardar evidencia del resultado `OK`.
- [ ] Confirmar backup diario automático y retención.
- [ ] Añadir copia externa de backups (S3/B2/Drive) para contingencia real.

### Datos y trazabilidad
- [ ] Validar que se registran `request_id`, `visitor_id`, `utm_source` en eventos.
- [ ] Validar que al entrar al canal Telegram se marca `telegram_activo=true`.
- [ ] Validar una prueba real extremo a extremo: visita → click → entrada Telegram → mensaje automático.

### Monitoreo
- [ ] Definir responsable de revisar salud diaria (persona/horario).
- [ ] Definir umbrales de alerta (errores webhook, caídas n8n, backlog de fallos).
- [ ] Registrar procedimiento de rollback rápido.

Cuando todos los checks estén en verde, el sistema está listo para tráfico real controlado (lanzamiento gradual) y luego escalado.
