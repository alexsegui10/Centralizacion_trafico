const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://krnabtkugfzfinwvfuzm.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtybmFidGt1Z2Z6Zmlud3ZmdXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQ1MjM4OCwiZXhwIjoyMDkwMDI4Mzg4fQ.9WZ6RuQ6wpXhVHy2vpDIun9-9xMVDBsysCOGTBuDyEU';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '-1003698170374';

if (!SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_WEBHOOK_SECRET) {
  console.error('Missing env vars: SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_WEBHOOK_SECRET');
  process.exit(1);
}

const PROXY = `${SUPABASE_URL}/functions/v1/api-proxy`;
const REST = `${SUPABASE_URL}/rest/v1`;

const state = {
  prefix: `test-batch-${Date.now()}`,
  results: [],
  artifacts: {}
};

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function proxyGet(query) {
  return fetch(`${PROXY}${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
}

async function proxyPost(query, body, headers = {}) {
  return fetch(`${PROXY}${query}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...headers
    },
    body: JSON.stringify(body)
  });
}

async function dbGet(path) {
  return fetch(`${REST}/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
}

async function dbDelete(path) {
  return fetch(`${REST}/${path}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation'
    }
  });
}

async function dbInsertLeads(rows) {
  return fetch(`${REST}/leads`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation'
    },
    body: JSON.stringify(rows)
  });
}

function record(name, details) {
  state.results.push({ test: name, ...details });
}

async function run() {
  const visitorId = `${state.prefix}-f1-user`;
  const fingerprint = `fp_${state.prefix}_deviceA`;
  const reqTelegram = crypto.randomUUID();
  const reqOnlyfans = crypto.randomUUID();

  await dbDelete(`eventos?visitor_id=eq.${encodeURIComponent(visitorId)}`);
  await dbDelete(`leads?visitor_id=eq.${encodeURIComponent(visitorId)}`);

  const f11 = await proxyGet(`?target=visitor&fingerprint=${encodeURIComponent(fingerprint)}`);
  const f11Body = await parseJsonSafe(f11);
  record('F1.1', {
    inserted: { fingerprint },
    executed: 'GET target=visitor',
    system_response: { status: f11.status, body: f11Body.json || f11Body.text }
  });

  const payloadTelegram = {
    request_id: reqTelegram,
    visitor_id: visitorId,
    fingerprint_hash: fingerprint,
    utm_source: 'tiktok',
    idioma: 'es',
    dispositivo: 'mobile',
    user_agent: 'f1-test',
    ip_hash: null,
    boton_clickado: 'telegram',
    modelo_id: 'MODEL_ID_PLACEHOLDER',
    timestamp: nowIso()
  };
  const f12 = await proxyPost('?target=track', payloadTelegram);
  const f12Body = await parseJsonSafe(f12);
  const f12Events = await parseJsonSafe(await dbGet(`eventos?select=request_id,visitor_id,boton_clickado,utm_source&request_id=eq.${reqTelegram}`));
  const f12Lead = await parseJsonSafe(await dbGet(`leads?select=visitor_id,fingerprint_hash,utm_source,idioma,dispositivo,telegram_activo,of_activo,updated_at&visitor_id=eq.${encodeURIComponent(visitorId)}`));
  record('F1.2', {
    inserted: payloadTelegram,
    executed: 'POST target=track telegram',
    system_response: { status: f12.status, body: f12Body.json || f12Body.text },
    supabase_after: { eventos: f12Events.json, leads: f12Lead.json }
  });

  const payloadOnlyfans = {
    ...payloadTelegram,
    request_id: reqOnlyfans,
    boton_clickado: 'onlyfans',
    timestamp: nowIso()
  };
  const f13 = await proxyPost('?target=track', payloadOnlyfans);
  const f13Body = await parseJsonSafe(f13);
  const f13Events = await parseJsonSafe(await dbGet(`eventos?select=request_id,boton_clickado&visitor_id=eq.${encodeURIComponent(visitorId)}&order=created_at.asc`));
  record('F1.3', {
    inserted: payloadOnlyfans,
    executed: 'POST target=track onlyfans',
    system_response: { status: f13.status, body: f13Body.json || f13Body.text },
    supabase_after: { eventos: f13Events.json }
  });

  const f14 = await proxyPost('?target=track', payloadTelegram);
  const f14Body = await parseJsonSafe(f14);
  const f14Check = await parseJsonSafe(await dbGet(`eventos?select=request_id&request_id=eq.${reqTelegram}`));
  record('F1.4', {
    inserted: payloadTelegram,
    executed: 'POST target=track duplicate same request_id',
    system_response: { status: f14.status, body: f14Body.json || f14Body.text },
    supabase_after: { request_id_rows: f14Check.json?.length ?? null }
  });

  const f15 = await proxyGet(`?target=visitor&fingerprint=${encodeURIComponent(fingerprint)}`);
  const f15Body = await parseJsonSafe(f15);
  record('F1.5', {
    inserted: { fingerprint },
    executed: 'GET target=visitor same fingerprint',
    system_response: { status: f15.status, body: f15Body.json || f15Body.text }
  });

  const f16 = await proxyGet(`?target=visitor&fingerprint=${encodeURIComponent(fingerprint)}`);
  const f16Body = await parseJsonSafe(f16);
  record('F1.6', {
    inserted: { fingerprint_hash: fingerprint },
    executed: 'GET target=visitor same fingerprint hash',
    system_response: { status: f16.status, body: f16Body.json || f16Body.text }
  });

  const inviteVisitor = `${state.prefix}-f2-invite`;
  await dbDelete(`leads?visitor_id=eq.${encodeURIComponent(inviteVisitor)}`);

  const f21Payload = { visitor_id: inviteVisitor, modelo_id: 'MODEL_ID_PLACEHOLDER' };
  const f21 = await proxyPost('?target=invite', f21Payload);
  const f21Body = await parseJsonSafe(f21);
  const inviteLink = f21Body.json?.invite_link;
  const f21Db = await parseJsonSafe(await dbGet(`leads?select=visitor_id,invite_link,invite_link_created_at&visitor_id=eq.${encodeURIComponent(inviteVisitor)}`));
  record('F2.1', {
    inserted: f21Payload,
    executed: 'POST target=invite first call',
    system_response: { status: f21.status, body: f21Body.json || f21Body.text },
    supabase_after: f21Db.json
  });

  const f22a = await parseJsonSafe(await proxyPost('?target=invite', f21Payload));
  const f22b = await parseJsonSafe(await proxyPost('?target=invite', f21Payload));
  record('F2.2', {
    inserted: f21Payload,
    executed: 'POST target=invite x3 total',
    system_response: [
      { call: 1, invite_link: inviteLink, reused: f21Body.json?.reused },
      { call: 2, invite_link: f22a.json?.invite_link, reused: f22a.json?.reused },
      { call: 3, invite_link: f22b.json?.invite_link, reused: f22b.json?.reused }
    ]
  });

  const telegramUserId = 999001;
  const f23Webhook = {
    update_id: Date.now(),
    chat_member: {
      chat: { id: Number(TELEGRAM_CHANNEL_ID), type: 'channel' },
      from: { id: 321, is_bot: false, first_name: 'Test' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'left', user: { id: telegramUserId, is_bot: false, first_name: 'Lead' } },
      new_chat_member: { status: 'member', user: { id: telegramUserId, is_bot: false, first_name: 'Lead' } },
      invite_link: { invite_link: inviteLink }
    }
  };
  const f23 = await proxyPost('?target=telegram-webhook', f23Webhook, {
    'x-telegram-bot-api-secret-token': TELEGRAM_WEBHOOK_SECRET
  });
  const f23Body = await parseJsonSafe(f23);
  const f23Db = await parseJsonSafe(await dbGet(`leads?select=visitor_id,telegram_activo,telegram_user_id,invite_link&visitor_id=eq.${encodeURIComponent(inviteVisitor)}`));
  record('F2.3', {
    inserted: f23Webhook,
    executed: 'POST target=telegram-webhook known invite',
    system_response: { status: f23.status, body: f23Body.json || f23Body.text },
    supabase_after: f23Db.json
  });

  const f24Webhook = {
    update_id: Date.now() + 1,
    chat_member: {
      new_chat_member: { status: 'member' },
      invite_link: { invite_link: 'https://t.me/+unknown_invite_for_test' }
    }
  };
  const f24 = await proxyPost('?target=telegram-webhook', f24Webhook, {
    'x-telegram-bot-api-secret-token': TELEGRAM_WEBHOOK_SECRET
  });
  const f24Body = await parseJsonSafe(f24);
  record('F2.4', {
    inserted: f24Webhook,
    executed: 'POST target=telegram-webhook unknown invite',
    system_response: { status: f24.status, body: f24Body.json || f24Body.text }
  });

  const f25VisitorId = `${state.prefix}-f25`;
  const f25Fingerprint = `fp_${state.prefix}_f25`;
  await dbDelete(`eventos?visitor_id=eq.${encodeURIComponent(f25VisitorId)}`);
  await dbDelete(`leads?visitor_id=eq.${encodeURIComponent(f25VisitorId)}`);

  const f25Step1 = await parseJsonSafe(await proxyGet(`?target=visitor&fingerprint=${encodeURIComponent(f25Fingerprint)}`));
  const f25InvitePayload = { visitor_id: f25VisitorId, modelo_id: 'MODEL_ID_PLACEHOLDER' };
  const f25Invite = await parseJsonSafe(await proxyPost('?target=invite', f25InvitePayload));
  const f25TrackPayload = {
    request_id: crypto.randomUUID(),
    visitor_id: f25VisitorId,
    fingerprint_hash: f25Fingerprint,
    utm_source: 'reddit',
    idioma: 'es',
    dispositivo: 'mobile',
    user_agent: 'f25-test',
    ip_hash: null,
    boton_clickado: 'telegram',
    modelo_id: 'MODEL_ID_PLACEHOLDER',
    timestamp: nowIso()
  };
  const f25Track = await parseJsonSafe(await proxyPost('?target=track', f25TrackPayload));
  const f25Webhook = {
    update_id: Date.now() + 2,
    chat_member: {
      chat: { id: Number(TELEGRAM_CHANNEL_ID), type: 'channel' },
      from: { id: 432, is_bot: false, first_name: 'Flow' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'left', user: { id: 999555, is_bot: false, first_name: 'Flow' } },
      new_chat_member: { status: 'member', user: { id: 999555, is_bot: false, first_name: 'Flow' } },
      invite_link: { invite_link: f25Invite.json?.invite_link }
    }
  };
  const f25WebhookResp = await parseJsonSafe(await proxyPost('?target=telegram-webhook', f25Webhook, {
    'x-telegram-bot-api-secret-token': TELEGRAM_WEBHOOK_SECRET
  }));

  await dbDelete(`eventos?request_id=eq.${encodeURIComponent(f25TrackPayload.request_id)}`);
  await proxyPost('?target=track', f25TrackPayload);

  await sleep(340000);
  const f25Db = await parseJsonSafe(await dbGet(`leads?select=visitor_id,utm_source,telegram_activo,telegram_user_id,active_flow,last_bot_action,updated_at,invite_link&visitor_id=eq.${encodeURIComponent(f25VisitorId)}`));

  record('F2.5', {
    inserted: {
      visitor_id: f25VisitorId,
      fingerprint: f25Fingerprint,
      utm_source: 'reddit',
      telegram_user_id: 999555
    },
    executed: 'visitor(null) -> invite -> track telegram -> telegram webhook -> detector wait',
    system_response: {
      visitor_lookup: f25Step1.json || f25Step1.text,
      invite: f25Invite.json || f25Invite.text,
      track: f25Track.json || f25Track.text,
      webhook: f25WebhookResp.json || f25WebhookResp.text
    },
    supabase_after: f25Db.json
  });

  const leadsSnapshot = await parseJsonSafe(await dbGet(`leads?select=visitor_id,utm_source,telegram_activo,of_activo,active_flow,winback_sent,telegram_user_id,invite_link,updated_at&visitor_id=like.${encodeURIComponent(state.prefix + '%')}&order=visitor_id.asc`));
  const eventosSnapshot = await parseJsonSafe(await dbGet(`eventos?select=request_id,visitor_id,boton_clickado,utm_source,created_at&visitor_id=like.${encodeURIComponent(state.prefix + '%')}&order=created_at.asc`));

  state.artifacts.supabase_before_cleanup = {
    leads: leadsSnapshot.json,
    eventos: eventosSnapshot.json
  };

  await dbDelete(`eventos?visitor_id=like.${encodeURIComponent(state.prefix + '%')}`);
  await dbDelete(`leads?visitor_id=like.${encodeURIComponent(state.prefix + '%')}`);

  const leadsAfterCleanup = await parseJsonSafe(await dbGet(`leads?select=visitor_id&visitor_id=like.${encodeURIComponent(state.prefix + '%')}`));
  const eventosAfterCleanup = await parseJsonSafe(await dbGet(`eventos?select=visitor_id&visitor_id=like.${encodeURIComponent(state.prefix + '%')}`));

  state.artifacts.cleanup_check = {
    leads_rows: Array.isArray(leadsAfterCleanup.json) ? leadsAfterCleanup.json.length : null,
    eventos_rows: Array.isArray(eventosAfterCleanup.json) ? eventosAfterCleanup.json.length : null
  };

  console.log(JSON.stringify(state, null, 2));
}

run().catch((error) => {
  console.error('RUN_FAILED', error?.message || error);
  process.exit(1);
});
