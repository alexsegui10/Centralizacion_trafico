// @ts-nocheck

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getRequiredEnv,
  handleOptions,
  jsonResponse,
  sha256Hex,
  validateHmacRequest
} from "../_shared/security.ts";

type TrackPayload = {
  request_id: string;
  visitor_id: string;
  fingerprint_hash: string | null;
  utm_source: string | null;
  idioma: string | null;
  dispositivo: string | null;
  user_agent: string | null;
  ip_hash: null;
  client_ip: string;
  boton_clickado: "onlyfans" | "telegram";
  modelo_id: string;
  timestamp: string;
};

type GeoLookup = {
  country: string | null;
  city: string | null;
};

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateTrackPayload(input: unknown): { ok: true; payload: TrackPayload } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "payload_not_object" };
  }

  const payload = input as Record<string, unknown>;

  const requestId = typeof payload.request_id === "string" ? payload.request_id.trim() : "";
  const visitorId = typeof payload.visitor_id === "string" ? payload.visitor_id.trim() : "";
  const modeloId = typeof payload.modelo_id === "string" ? payload.modelo_id.trim() : "";
  const button = payload.boton_clickado;
  const timestamp = typeof payload.timestamp === "string" ? payload.timestamp.trim() : "";
  const clientIp = typeof payload.client_ip === "string" ? payload.client_ip.split(",")[0].trim() : "0.0.0.0";

  if (!requestId || !isValidUuid(requestId)) {
    return { ok: false, error: "invalid_request_id" };
  }

  if (!visitorId) {
    return { ok: false, error: "invalid_visitor_id" };
  }

  if (!modeloId) {
    return { ok: false, error: "invalid_modelo_id" };
  }

  if (button !== "onlyfans" && button !== "telegram") {
    return { ok: false, error: "invalid_boton_clickado" };
  }

  const parsedTs = Date.parse(timestamp);
  if (!timestamp || Number.isNaN(parsedTs)) {
    return { ok: false, error: "invalid_timestamp" };
  }

  const now = Date.now();
  const maxAgeMs = 24 * 60 * 60 * 1000;
  if (parsedTs > now + 5 * 60 * 1000) {
    return { ok: false, error: "timestamp_in_future" };
  }
  if (now - parsedTs > maxAgeMs) {
    return { ok: false, error: "timestamp_too_old" };
  }

  return {
    ok: true,
    payload: {
      request_id: requestId,
      visitor_id: visitorId,
      fingerprint_hash: typeof payload.fingerprint_hash === "string" ? payload.fingerprint_hash : null,
      utm_source: typeof payload.utm_source === "string" ? payload.utm_source : null,
      idioma: typeof payload.idioma === "string" ? payload.idioma : null,
      dispositivo: typeof payload.dispositivo === "string" ? payload.dispositivo : null,
      user_agent: typeof payload.user_agent === "string" ? payload.user_agent : null,
      ip_hash: null,
      client_ip: clientIp || "0.0.0.0",
      boton_clickado: button,
      modelo_id: modeloId,
      timestamp
    }
  };
}

async function lookupGeo(ip: string): Promise<GeoLookup> {
  if (!ip || ip === "0.0.0.0" || ip === "::1" || ip === "127.0.0.1") {
    return { country: null, city: null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);

  try {
    const response = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, {
      signal: controller.signal
    });
    if (!response.ok) return { country: null, city: null };
    const data = await response.json();
    return {
      country: data.country || null,
      city: data.city || null
    };
  } catch {
    return { country: null, city: null };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const shouldLogHeaders = Deno.env.get("LOG_API_TRACK_HEADERS") === "true";
    if (shouldLogHeaders) {
      const allHeaders = Object.fromEntries(req.headers.entries());
      console.log("[api-track] incoming_headers", JSON.stringify(allHeaders));
    }

    const rawBody = await req.text();

    const hmacSecret = getRequiredEnv("EDGE_HMAC_SECRET");
    const canonical = `POST\n/api/track\n${req.headers.get("x-timestamp") ?? ""}\n${rawBody}`;

    const hmacResult = await validateHmacRequest({
      req,
      canonicalPayload: canonical,
      secret: hmacSecret,
      maxAgeSeconds: 300
    });

    if (!hmacResult.ok) {
      return hmacResult.response;
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return jsonResponse(400, { ok: false, error: "invalid_json" });
    }

    const validation = validateTrackPayload(parsedBody);
    if (!validation.ok) {
      return jsonResponse(400, { ok: false, error: validation.error });
    }

    const payload = validation.payload;

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const clientIp = payload.client_ip;
    if (shouldLogHeaders) {
      console.log("[api-track] resolved_client_ip", clientIp);
    }
    const ipHash = await sha256Hex(clientIp);
    const geo = await lookupGeo(clientIp);

    const leadUpsertRow = {
      visitor_id: payload.visitor_id,
      fingerprint_hash: payload.fingerprint_hash,
      modelo_id: payload.modelo_id,
      utm_source: payload.utm_source,
      idioma: payload.idioma,
      dispositivo: payload.dispositivo,
      user_agent: payload.user_agent,
      ip_hash: ipHash,
      pais: geo.country,
      ciudad: geo.city
    };

    const { error: leadError } = await supabase
      .from("leads")
      .upsert(leadUpsertRow, { onConflict: "visitor_id", ignoreDuplicates: false });

    if (leadError) {
      return jsonResponse(500, { ok: false, error: "lead_upsert_failed", details: leadError.message });
    }

    const eventInsertRow = {
      request_id: payload.request_id,
      visitor_id: payload.visitor_id,
      modelo_id: payload.modelo_id,
      boton_clickado: payload.boton_clickado,
      utm_source: payload.utm_source,
      idioma: payload.idioma,
      dispositivo: payload.dispositivo,
      user_agent: payload.user_agent,
      fingerprint_hash: payload.fingerprint_hash
    };

    const { error: eventError } = await supabase
      .from("eventos")
      .upsert(eventInsertRow, { onConflict: "request_id", ignoreDuplicates: true });

    if (eventError) {
      return jsonResponse(500, { ok: false, error: "event_insert_failed", details: eventError.message });
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "internal_error",
      details: error instanceof Error ? error.message : "unknown_error"
    });
  }
});
