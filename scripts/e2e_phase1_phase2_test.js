const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_WEBHOOK_SECRET || !TELEGRAM_CHANNEL_ID) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CHANNEL_ID");
  process.exit(1);
}

const PROXY_BASE = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/api-proxy`;

const state = {
  trackRequestId: crypto.randomUUID(),
  trackVisitorId: crypto.randomUUID(),
  trackFingerprint: `fp_${crypto.randomUUID().replace(/-/g, "")}`,
  inviteVisitorId: `test-invite-${Date.now()}`,
  inviteLink: null
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function proxyGet(path) {
  return fetch(`${PROXY_BASE}${path}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
}

async function proxyPost(path, body, extraHeaders = {}) {
  return fetch(`${PROXY_BASE}${path}`, {
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
  return fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
}

async function testVisitorMissingFingerprint() {
  const response = await proxyGet("?target=visitor");
  const { json, text } = await parseJsonSafe(response);
  assert(response.status === 400, `visitor missing fingerprint expected 400, got ${response.status} :: ${text}`);
  assert(json && json.error === "missing_fingerprint", `visitor missing fingerprint expected error missing_fingerprint :: ${text}`);
}

async function testTrackInvalidPayload() {
  const response = await proxyPost("?target=track", {
    request_id: "bad",
    visitor_id: "",
    boton_clickado: "bad",
    modelo_id: "",
    timestamp: "bad"
  });
  const { text } = await parseJsonSafe(response);
  assert(response.status === 400, `track invalid payload expected 400, got ${response.status} :: ${text}`);
}

async function testTrackAndDedupe() {
  const payload = {
    request_id: state.trackRequestId,
    visitor_id: state.trackVisitorId,
    fingerprint_hash: state.trackFingerprint,
    utm_source: "instagram",
    idioma: "es",
    dispositivo: "mobile",
    user_agent: "e2e-script",
    ip_hash: null,
    boton_clickado: "onlyfans",
    modelo_id: "MODEL_ID_PLACEHOLDER",
    timestamp: new Date().toISOString()
  };

  const first = await proxyPost("?target=track", payload);
  const firstBody = await parseJsonSafe(first);
  assert(first.status === 200, `track first expected 200, got ${first.status} :: ${firstBody.text}`);

  const second = await proxyPost("?target=track", payload);
  const secondBody = await parseJsonSafe(second);
  assert(second.status === 200, `track duplicate expected 200, got ${second.status} :: ${secondBody.text}`);

  const dbCheck = await dbGet(`eventos?select=request_id&request_id=eq.${state.trackRequestId}`);
  const dbData = await parseJsonSafe(dbCheck);
  assert(dbCheck.status === 200, `db eventos lookup expected 200, got ${dbCheck.status} :: ${dbData.text}`);
  assert(Array.isArray(dbData.json), `db eventos lookup expected array :: ${dbData.text}`);
  assert(dbData.json.length === 1, `event dedupe expected 1 row, got ${dbData.json.length}`);
}

async function testVisitorLookupAfterTrack() {
  const response = await proxyGet(`?target=visitor&fingerprint=${encodeURIComponent(state.trackFingerprint)}`);
  const { json, text } = await parseJsonSafe(response);
  assert(response.status === 200, `visitor lookup expected 200, got ${response.status} :: ${text}`);
  assert(json && json.visitor_id === state.trackVisitorId, `visitor lookup expected ${state.trackVisitorId}, got ${json ? json.visitor_id : "null"}`);
}

async function testInviteCreateAndReuse() {
  const payload = { visitor_id: state.inviteVisitorId, modelo_id: "MODEL_ID_PLACEHOLDER" };

  const first = await proxyPost("?target=invite", payload);
  const firstBody = await parseJsonSafe(first);
  assert(first.status === 200, `invite first expected 200, got ${first.status} :: ${firstBody.text}`);
  assert(firstBody.json && typeof firstBody.json.invite_link === "string", `invite first expected invite_link string :: ${firstBody.text}`);
  assert(firstBody.json.reused === false, `invite first expected reused=false :: ${firstBody.text}`);

  state.inviteLink = firstBody.json.invite_link;

  const second = await proxyPost("?target=invite", payload);
  const secondBody = await parseJsonSafe(second);
  assert(second.status === 200, `invite second expected 200, got ${second.status} :: ${secondBody.text}`);
  assert(secondBody.json && secondBody.json.reused === true, `invite second expected reused=true :: ${secondBody.text}`);
  assert(secondBody.json.invite_link === state.inviteLink, `invite second expected same invite link`);
}

async function testWebhookWrongSecret() {
  const response = await proxyPost(
    "?target=telegram-webhook",
    { update_id: 1 },
    { "x-telegram-bot-api-secret-token": "wrong-secret" }
  );
  const { text } = await parseJsonSafe(response);
  assert(response.status === 401, `webhook wrong secret expected 401, got ${response.status} :: ${text}`);
}

async function testWebhookIgnoredCases() {
  const nonMemberPayload = {
    update_id: Date.now(),
    chat_member: {
      new_chat_member: { status: "left" },
      invite_link: { invite_link: state.inviteLink }
    }
  };

  const nonMember = await proxyPost(
    "?target=telegram-webhook",
    nonMemberPayload,
    { "x-telegram-bot-api-secret-token": TELEGRAM_WEBHOOK_SECRET }
  );
  const nonMemberBody = await parseJsonSafe(nonMember);
  assert(nonMember.status === 200, `webhook non-member expected 200, got ${nonMember.status} :: ${nonMemberBody.text}`);
  assert(nonMemberBody.json && nonMemberBody.json.ignored === true, `webhook non-member expected ignored=true :: ${nonMemberBody.text}`);

  const unknownInvitePayload = {
    update_id: Date.now() + 1,
    chat_member: {
      new_chat_member: { status: "member" },
      invite_link: { invite_link: "https://t.me/+unknown_invite_123" }
    }
  };

  const unknownInvite = await proxyPost(
    "?target=telegram-webhook",
    unknownInvitePayload,
    { "x-telegram-bot-api-secret-token": TELEGRAM_WEBHOOK_SECRET }
  );
  const unknownInviteBody = await parseJsonSafe(unknownInvite);
  assert(unknownInvite.status === 200, `webhook unknown invite expected 200, got ${unknownInvite.status} :: ${unknownInviteBody.text}`);
  assert(unknownInviteBody.json && unknownInviteBody.json.ignored === true, `webhook unknown invite expected ignored=true :: ${unknownInviteBody.text}`);
}

async function testWebhookActivation() {
  const payload = {
    update_id: Date.now() + 2,
    chat_member: {
      chat: { id: Number(TELEGRAM_CHANNEL_ID), type: "channel" },
      from: { id: 123, is_bot: false, first_name: "Test" },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: "left", user: { id: 555111, is_bot: false, first_name: "User" } },
      new_chat_member: { status: "member", user: { id: 555111, is_bot: false, first_name: "User" } },
      invite_link: { invite_link: state.inviteLink }
    }
  };

  const response = await proxyPost(
    "?target=telegram-webhook",
    payload,
    { "x-telegram-bot-api-secret-token": TELEGRAM_WEBHOOK_SECRET }
  );
  const body = await parseJsonSafe(response);
  assert(response.status === 200, `webhook activation expected 200, got ${response.status} :: ${body.text}`);
  assert(body.json && body.json.ok === true, `webhook activation expected ok=true :: ${body.text}`);
  assert(body.json.visitor_id === state.inviteVisitorId, `webhook activation visitor mismatch expected ${state.inviteVisitorId} got ${body.json ? body.json.visitor_id : "null"}`);

  const dbCheck = await dbGet(`leads?select=visitor_id,telegram_activo,invite_link&visitor_id=eq.${encodeURIComponent(state.inviteVisitorId)}`);
  const dbData = await parseJsonSafe(dbCheck);
  assert(dbCheck.status === 200, `db lead lookup expected 200, got ${dbCheck.status} :: ${dbData.text}`);
  assert(Array.isArray(dbData.json) && dbData.json.length === 1, `db lead lookup expected 1 row :: ${dbData.text}`);
  assert(dbData.json[0].telegram_activo === true, `telegram_activo expected true :: ${dbData.text}`);
  assert(dbData.json[0].invite_link === state.inviteLink, `invite_link mismatch in DB`);
}

async function testTrackConcurrencyDedupeStress() {
  const requestId = crypto.randomUUID();
  const visitorId = crypto.randomUUID();

  const payload = {
    request_id: requestId,
    visitor_id: visitorId,
    fingerprint_hash: `fp_concurrency_${crypto.randomUUID().replace(/-/g, "")}`,
    utm_source: "stress",
    idioma: "es",
    dispositivo: "mobile",
    user_agent: "stress-concurrency",
    ip_hash: null,
    boton_clickado: "onlyfans",
    modelo_id: "MODEL_ID_PLACEHOLDER",
    timestamp: new Date().toISOString()
  };

  const calls = Array.from({ length: 15 }, () => proxyPost("?target=track", payload));
  const responses = await Promise.all(calls);
  const statuses = responses.map((response) => response.status);

  assert(statuses.every((status) => status === 200), `concurrency dedupe expected all 200, got ${JSON.stringify(statuses)}`);

  const dbCheck = await dbGet(`eventos?select=request_id&request_id=eq.${requestId}`);
  const dbData = await parseJsonSafe(dbCheck);
  assert(dbCheck.status === 200, `concurrency db lookup expected 200, got ${dbCheck.status} :: ${dbData.text}`);
  assert(Array.isArray(dbData.json), `concurrency db lookup expected array :: ${dbData.text}`);
  assert(dbData.json.length === 1, `concurrency dedupe expected 1 row, got ${dbData.json.length}`);
}

async function testTrackBulkStress() {
  const visitorId = `stress-${Date.now()}`;
  const fingerprintHash = `fp_stress_${crypto.randomUUID().replace(/-/g, "")}`;
  const total = 30;

  for (let index = 0; index < total; index += 1) {
    const payload = {
      request_id: crypto.randomUUID(),
      visitor_id: visitorId,
      fingerprint_hash: fingerprintHash,
      utm_source: "stress",
      idioma: "es",
      dispositivo: "mobile",
      user_agent: "stress-bulk",
      ip_hash: null,
      boton_clickado: index % 2 === 0 ? "onlyfans" : "telegram",
      modelo_id: "MODEL_ID_PLACEHOLDER",
      timestamp: new Date().toISOString()
    };

    const response = await proxyPost("?target=track", payload);
    const body = await parseJsonSafe(response);
    assert(response.status === 200, `bulk track call ${index + 1}/${total} expected 200, got ${response.status} :: ${body.text}`);
  }

  const dbEvents = await dbGet(`eventos?select=id&visitor_id=eq.${encodeURIComponent(visitorId)}`);
  const dbEventsData = await parseJsonSafe(dbEvents);
  assert(dbEvents.status === 200, `bulk db events expected 200, got ${dbEvents.status} :: ${dbEventsData.text}`);
  assert(Array.isArray(dbEventsData.json), `bulk db events expected array :: ${dbEventsData.text}`);
  assert(dbEventsData.json.length === total, `bulk expected ${total} events, got ${dbEventsData.json.length}`);

  const lookupResponse = await proxyGet(`?target=visitor&fingerprint=${encodeURIComponent(fingerprintHash)}`);
  const lookupBody = await parseJsonSafe(lookupResponse);
  assert(lookupResponse.status === 200, `bulk visitor lookup expected 200, got ${lookupResponse.status} :: ${lookupBody.text}`);
  assert(lookupBody.json && lookupBody.json.visitor_id === visitorId, `bulk visitor lookup expected ${visitorId}, got ${lookupBody.json ? lookupBody.json.visitor_id : "null"}`);
}

async function run() {
  const tests = [
    ["visitor_missing_fingerprint", testVisitorMissingFingerprint],
    ["track_invalid_payload", testTrackInvalidPayload],
    ["track_and_dedupe", testTrackAndDedupe],
    ["visitor_lookup_after_track", testVisitorLookupAfterTrack],
    ["invite_create_and_reuse", testInviteCreateAndReuse],
    ["webhook_wrong_secret", testWebhookWrongSecret],
    ["webhook_ignored_cases", testWebhookIgnoredCases],
    ["webhook_activation", testWebhookActivation],
    ["track_concurrency_dedupe_stress", testTrackConcurrencyDedupeStress],
    ["track_bulk_stress", testTrackBulkStress]
  ];

  const startedAt = Date.now();

  for (const [name, fn] of tests) {
    const testStart = Date.now();
    await fn();
    const ms = Date.now() - testStart;
    console.log(`PASS ${name} (${ms}ms)`);
  }

  console.log("---");
  console.log("All tests passed");
  console.log(`track_request_id=${state.trackRequestId}`);
  console.log(`track_visitor_id=${state.trackVisitorId}`);
  console.log(`invite_visitor_id=${state.inviteVisitorId}`);
  console.log(`invite_link=${state.inviteLink}`);
  console.log(`total_ms=${Date.now() - startedAt}`);
}

run().catch((error) => {
  console.error("TEST_FAILURE", error?.message || error);
  process.exit(1);
});