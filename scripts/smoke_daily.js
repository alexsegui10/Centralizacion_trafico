const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_WEBHOOK_SECRET) {
  console.error("Missing env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_WEBHOOK_SECRET");
  process.exit(1);
}

const BASE = SUPABASE_URL.replace(/\/$/, "");
const PROXY = `${BASE}/functions/v1/api-proxy`;
const REST = `${BASE}/rest/v1`;
const MODEL_ID = "MODEL_ID_PLACEHOLDER";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function parseJson(response) {
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { text, data };
}

async function proxyGet(url) {
  return fetch(`${PROXY}${url}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
}

async function proxyPost(url, body, extraHeaders = {}) {
  return fetch(`${PROXY}${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });
}

async function dbGet(path) {
  return fetch(`${REST}/${path}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
}

async function run() {
  const started = Date.now();
  const fingerprint = `smoke_fp_${crypto.randomUUID().replace(/-/g, "")}`;
  const visitorId = crypto.randomUUID();
  const requestId = crypto.randomUUID();

  const lookup1 = await proxyGet(`?target=visitor&fingerprint=${encodeURIComponent(fingerprint)}`);
  const lookup1Body = await parseJson(lookup1);
  assert(lookup1.status === 200, `visitor lookup status ${lookup1.status}`);
  assert(lookup1Body.data && lookup1Body.data.visitor_id === null, `visitor lookup expected null :: ${lookup1Body.text}`);
  console.log("PASS visitor_unknown_fingerprint");

  const invite1 = await proxyPost("?target=invite", { visitor_id: visitorId, modelo_id: MODEL_ID });
  const invite1Body = await parseJson(invite1);
  assert(invite1.status === 200, `invite first status ${invite1.status}`);
  assert(invite1Body.data && typeof invite1Body.data.invite_link === "string", `invite first missing link :: ${invite1Body.text}`);
  assert(invite1Body.data.reused === false, `invite first expected reused=false :: ${invite1Body.text}`);
  console.log("PASS invite_create");

  const invite2 = await proxyPost("?target=invite", { visitor_id: visitorId, modelo_id: MODEL_ID });
  const invite2Body = await parseJson(invite2);
  assert(invite2.status === 200, `invite second status ${invite2.status}`);
  assert(invite2Body.data && invite2Body.data.reused === true, `invite second expected reused=true :: ${invite2Body.text}`);
  assert(invite2Body.data.invite_link === invite1Body.data.invite_link, "invite second must reuse same link");
  console.log("PASS invite_reuse");

  const trackPayload = {
    request_id: requestId,
    visitor_id: visitorId,
    fingerprint_hash: fingerprint,
    utm_source: "smoke",
    idioma: "es",
    dispositivo: "mobile",
    user_agent: "smoke-daily",
    ip_hash: null,
    boton_clickado: "telegram",
    modelo_id: MODEL_ID,
    timestamp: new Date().toISOString()
  };

  const track1 = await proxyPost("?target=track", trackPayload);
  const track1Body = await parseJson(track1);
  assert(track1.status === 200, `track first status ${track1.status} :: ${track1Body.text}`);

  const track2 = await proxyPost("?target=track", trackPayload);
  const track2Body = await parseJson(track2);
  assert(track2.status === 200, `track duplicate status ${track2.status} :: ${track2Body.text}`);

  const dedupeCheck = await dbGet(`eventos?select=request_id&request_id=eq.${requestId}`);
  const dedupeBody = await parseJson(dedupeCheck);
  assert(dedupeCheck.status === 200, `dedupe db status ${dedupeCheck.status}`);
  assert(Array.isArray(dedupeBody.data) && dedupeBody.data.length === 1, `dedupe expected 1 row :: ${dedupeBody.text}`);
  console.log("PASS track_and_dedupe");

  const webhookIgnored = await proxyPost(
    "?target=telegram-webhook",
    {
      update_id: Date.now(),
      chat_member: {
        new_chat_member: { status: "member" },
        invite_link: { invite_link: "https://t.me/+smoke_unknown_link" }
      }
    },
    { "x-telegram-bot-api-secret-token": TELEGRAM_WEBHOOK_SECRET }
  );
  const webhookBody = await parseJson(webhookIgnored);
  assert(webhookIgnored.status === 200, `webhook ignored status ${webhookIgnored.status} :: ${webhookBody.text}`);
  assert(webhookBody.data && webhookBody.data.ignored === true, `webhook expected ignored=true :: ${webhookBody.text}`);
  console.log("PASS webhook_ignore_unknown_invite");

  console.log("---");
  console.log("SMOKE_OK", JSON.stringify({
    total_ms: Date.now() - started,
    visitor_id: visitorId,
    request_id: requestId,
    invite_link: invite1Body.data.invite_link
  }));
}

run().catch((error) => {
  console.error("SMOKE_FAIL", error?.message || error);
  process.exit(1);
});
