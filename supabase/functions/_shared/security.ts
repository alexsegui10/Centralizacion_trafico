// @ts-nocheck

export const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-timestamp",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

export function jsonResponse(status: number, data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS
    }
  });
}

export function handleOptions(req: Request): Response | null {
  if (req.method !== "OPTIONS") {
    return null;
  }
  return new Response("ok", { headers: CORS_HEADERS });
}

export function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.split(",")[0]?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byteValue) => byteValue.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

export async function createHmacSignature(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

export type HmacValidationResult =
  | { ok: true; timestampSeconds: number }
  | { ok: false; response: Response };

export async function validateHmacRequest(params: {
  req: Request;
  canonicalPayload: string;
  secret: string;
  maxAgeSeconds: number;
  allowFutureSkewSeconds?: number;
}): Promise<HmacValidationResult> {
  const { req, canonicalPayload, secret, maxAgeSeconds, allowFutureSkewSeconds = 300 } = params;

  const providedSignature = req.headers.get("x-signature")?.trim().toLowerCase();
  const providedTimestamp = req.headers.get("x-timestamp")?.trim();

  if (!providedSignature || !providedTimestamp) {
    return {
      ok: false,
      response: jsonResponse(401, {
        ok: false,
        error: "missing_hmac_headers",
        required_headers: ["x-signature", "x-timestamp"]
      })
    };
  }

  const timestampSeconds = Number(providedTimestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return {
      ok: false,
      response: jsonResponse(401, { ok: false, error: "invalid_hmac_timestamp" })
    };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (timestampSeconds > nowSeconds + allowFutureSkewSeconds) {
    return {
      ok: false,
      response: jsonResponse(401, { ok: false, error: "timestamp_in_future" })
    };
  }

  if (nowSeconds - timestampSeconds > maxAgeSeconds) {
    return {
      ok: false,
      response: jsonResponse(401, { ok: false, error: "signature_expired" })
    };
  }

  const expectedSignature = await createHmacSignature(secret, canonicalPayload);
  if (!timingSafeEqual(expectedSignature, providedSignature)) {
    return {
      ok: false,
      response: jsonResponse(401, { ok: false, error: "invalid_signature" })
    };
  }

  return { ok: true, timestampSeconds };
}
