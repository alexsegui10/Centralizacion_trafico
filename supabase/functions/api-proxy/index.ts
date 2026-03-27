// @ts-nocheck

import {
  CORS_HEADERS,
  createHmacSignature,
  getRequiredEnv,
  handleOptions,
  jsonResponse
} from "../_shared/security.ts";

function getFunctionsBaseUrl(): string {
  const explicitBase = Deno.env.get("SUPABASE_FUNCTIONS_BASE_URL")?.trim();
  if (explicitBase) {
    return explicitBase.replace(/\/+$/, "");
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL").trim().replace(/\/+$/, "");
  return `${supabaseUrl}/functions/v1`;
}

async function proxyVisitor(req: Request, url: URL, hmacSecret: string): Promise<Response> {
  const fingerprint = url.searchParams.get("fingerprint")?.trim();
  if (!fingerprint) {
    return jsonResponse(400, { ok: false, error: "missing_fingerprint" });
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const canonical = `GET\n/api/visitor\n${timestamp}\n${fingerprint}`;
  const signature = await createHmacSignature(hmacSecret, canonical);

  const upstreamUrl = `${getFunctionsBaseUrl()}/api-visitor?fingerprint=${encodeURIComponent(fingerprint)}`;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  const upstreamResponse = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      "x-timestamp": timestamp,
      "x-signature": signature,
      ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {})
    }
  });

  const text = await upstreamResponse.text();
  return new Response(text, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
      ...CORS_HEADERS
    }
  });
}

async function proxyTrack(req: Request, hmacSecret: string): Promise<Response> {
  const rawBody = await req.text();
  if (!rawBody || !rawBody.trim()) {
    return jsonResponse(400, { ok: false, error: "missing_body" });
  }

  const clientIp =
    req.headers.get("cf-connecting-ip")?.split(",")[0]?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0";

  let parsedBody: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse(400, { ok: false, error: "invalid_json_body" });
    }
    parsedBody = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_json_body" });
  }

  const modifiedBody = JSON.stringify({
    ...parsedBody,
    client_ip: clientIp
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const canonical = `POST\n/api/track\n${timestamp}\n${modifiedBody}`;
  const signature = await createHmacSignature(hmacSecret, canonical);

  const upstreamUrl = `${getFunctionsBaseUrl()}/api-track`;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  const upstreamResponse = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-timestamp": timestamp,
      "x-signature": signature,
      ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {})
    },
    body: modifiedBody
  });

  const text = await upstreamResponse.text();
  return new Response(text, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
      ...CORS_HEADERS
    }
  });
}

async function proxyInvite(req: Request, hmacSecret: string): Promise<Response> {
  const rawBody = await req.text();
  if (!rawBody || !rawBody.trim()) {
    return jsonResponse(400, { ok: false, error: "missing_body" });
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const canonical = `POST\n/api/invite\n${timestamp}\n${rawBody}`;
  const signature = await createHmacSignature(hmacSecret, canonical);

  const upstreamUrl = `${getFunctionsBaseUrl()}/api-invite`;

  const upstreamResponse = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-timestamp": timestamp,
      "x-signature": signature
    },
    body: rawBody
  });

  const text = await upstreamResponse.text();
  return new Response(text, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
      ...CORS_HEADERS
    }
  });
}

async function proxyTelegramWebhook(req: Request): Promise<Response> {
  const rawBody = await req.text();
  if (!rawBody || !rawBody.trim()) {
    return jsonResponse(400, { ok: false, error: "missing_body" });
  }

  const secretHeader = req.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  const upstreamUrl = `${getFunctionsBaseUrl()}/api-webhook-telegram`;

  const upstreamResponse = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secretHeader ? { "X-Telegram-Bot-Api-Secret-Token": secretHeader } : {})
    },
    body: rawBody
  });

  const text = await upstreamResponse.text();
  return new Response(text, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
      ...CORS_HEADERS
    }
  });
}

Deno.serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("target")?.trim();

  if (target === 'debug') {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => { headers[key] = value; });
    return jsonResponse(200, { headers });
  }

    const hmacSecret = getRequiredEnv("EDGE_HMAC_SECRET");

    if (req.method === "GET" && target === "visitor") {
      return await proxyVisitor(req, url, hmacSecret);
    }

    if (req.method === "POST" && target === "track") {
      return await proxyTrack(req, hmacSecret);
    }

    if (req.method === "POST" && target === "invite") {
      return await proxyInvite(req, hmacSecret);
    }

    if (req.method === "POST" && target === "telegram-webhook") {
      return await proxyTelegramWebhook(req);
    }

    return jsonResponse(400, {
      ok: false,
      error: "invalid_target_or_method",
      expected: {
        visitor: "GET /api/proxy?target=visitor&fingerprint=...",
        track: "POST /api/proxy?target=track",
        invite: "POST /api/proxy?target=invite",
        telegram_webhook: "POST /api/proxy?target=telegram-webhook"
      }
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "internal_error",
      details: error instanceof Error ? error.message : "unknown_error"
    });
  }
});
