const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_WEBHOOK_SECRET || !TELEGRAM_CHANNEL_ID) {
  console.error("Missing env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CHANNEL_ID");
  process.exit(1);
}

const MODEL_ID = "MODEL_ID_PLACEHOLDER";
const BASE = SUPABASE_URL.replace(/\/$/, "");
const PROXY = `${BASE}/functions/v1/api-proxy`;
const REST = `${BASE}/rest/v1`;

const audit = {
  meta: {
    started_at: new Date().toISOString(),
    model_id: MODEL_ID
  },
  flow: {},
  edge_cases: {},
  final_queries: {},
  assertions: []
};

function assertOrThrow(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
  audit.assertions.push({ ok: true, message });
}

async function parseResponse(response) {
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type")
    },
    body_text: text,
    body_json: json
  };
}

async function callProxyGet(path) {
  const url = `${PROXY}${path}`;
  const req = {
    method: "GET",
    url,
    headers: {
      apikey: "<anon>",
      Authorization: "Bearer <anon>"
    }
  };
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  return { request: req, response: await parseResponse(res) };
}

async function callProxyPost(path, body, extraHeaders = {}) {
  const url = `${PROXY}${path}`;
  const req = {
    method: "POST",
    url,
    headers: {
      "Content-Type": "application/json",
      apikey: "<anon>",
      Authorization: "Bearer <anon>",
      ...Object.fromEntries(Object.keys(extraHeaders).map((k) => [k, "<provided>"]))
    },
    body
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });
  return { request: req, response: await parseResponse(res) };
}

async function queryLeadsByVisitor(visitorId) {
  const url = `${REST}/leads?select=visitor_id,utm_source,idioma,dispositivo,invite_link,invite_link_created_at,telegram_activo,of_activo,fingerprint_hash,modelo_id,created_at,updated_at&visitor_id=eq.${encodeURIComponent(visitorId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const parsed = await parseResponse(res);
  return {
    query: "leads by visitor_id",
    url,
    ...parsed
  };
}

async function queryEventosByVisitor(visitorId) {
  const url = `${REST}/eventos?select=visitor_id,boton_clickado,request_id,created_at,modelo_id,utm_source,idioma,dispositivo&visitor_id=eq.${encodeURIComponent(visitorId)}&order=created_at.asc`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const parsed = await parseResponse(res);
  return {
    query: "eventos by visitor_id",
    url,
    ...parsed
  };
}

async function finalQueryLeads() {
  const url = `${REST}/leads?select=visitor_id,utm_source,idioma,invite_link,telegram_activo,of_activo`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  return {
    sql: "select visitor_id, utm_source, idioma, invite_link, telegram_activo, of_activo from leads;",
    transport: "postgrest_equivalent",
    ...(await parseResponse(res))
  };
}

async function finalQueryEventos() {
  const url = `${REST}/eventos?select=visitor_id,boton_clickado,request_id,created_at&order=created_at.asc`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  return {
    sql: "select visitor_id, boton_clickado, request_id, created_at from eventos order by created_at;",
    transport: "postgrest_equivalent",
    ...(await parseResponse(res))
  };
}

async function runFlow() {
  const fingerprint = `audit_fp_${crypto.randomUUID().replace(/-/g, "")}`;
  const visitorId = crypto.randomUUID();
  const utm = "instagram";
  const idioma = "es";
  const dispositivo = "mobile";

  audit.meta.flow_context = { fingerprint, visitor_id: visitorId };

  const stepA1 = await callProxyGet(`?target=visitor&fingerprint=${encodeURIComponent(fingerprint)}`);
  audit.flow.a = {
    description: "Usuario nuevo sin cookies: lookup por fingerprint y generación local de visitor_id",
    lookup_request_response: stepA1,
    generated_visitor_id_client_side: visitorId
  };
  assertOrThrow(stepA1.response.status === 200, `Paso a: lookup status=200`);
  assertOrThrow(stepA1.response.body_json && stepA1.response.body_json.visitor_id === null, `Paso a: visitor lookup null`);

  const stepB = await callProxyPost("?target=invite", {
    visitor_id: visitorId,
    modelo_id: MODEL_ID
  });
  const leadsAfterB = await queryLeadsByVisitor(visitorId);
  audit.flow.b = {
    description: "Crear invite_link nuevo para visitor_id y guardar en leads",
    invite_request_response: stepB,
    supabase_state_after_step: {
      leads_row: leadsAfterB
    }
  };
  assertOrThrow(stepB.response.status === 200, `Paso b: invite status=200`);
  assertOrThrow(stepB.response.body_json && typeof stepB.response.body_json.invite_link === "string", `Paso b: invite_link presente`);
  assertOrThrow(stepB.response.body_json && stepB.response.body_json.reused === false, `Paso b: reused=false en primer invite`);

  const inviteLink = stepB.response.body_json.invite_link;

  const tgRequestId = crypto.randomUUID();
  const stepC = await callProxyPost("?target=track", {
    request_id: tgRequestId,
    visitor_id: visitorId,
    fingerprint_hash: fingerprint,
    utm_source: utm,
    idioma,
    dispositivo,
    user_agent: "audit-script",
    ip_hash: null,
    boton_clickado: "telegram",
    modelo_id: MODEL_ID,
    timestamp: new Date().toISOString()
  });
  const leadsAfterC = await queryLeadsByVisitor(visitorId);
  const eventosAfterC = await queryEventosByVisitor(visitorId);
  audit.flow.c = {
    description: "Click Telegram: track + actualización de leads",
    track_request_response: stepC,
    supabase_state_after_step: {
      leads_row: leadsAfterC,
      eventos_rows: eventosAfterC
    }
  };
  assertOrThrow(stepC.response.status === 200, `Paso c: track telegram status=200`);

  const webhookPayload = {
    update_id: Date.now(),
    chat_member: {
      chat: { id: Number(TELEGRAM_CHANNEL_ID), type: "channel" },
      from: { id: 123, is_bot: false, first_name: "Audit" },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: "left", user: { id: 555001, is_bot: false, first_name: "User" } },
      new_chat_member: { status: "member", user: { id: 555001, is_bot: false, first_name: "User" } },
      invite_link: { invite_link: inviteLink }
    }
  };

  const stepD = await callProxyPost(
    "?target=telegram-webhook",
    webhookPayload,
    { "x-telegram-bot-api-secret-token": TELEGRAM_WEBHOOK_SECRET }
  );
  const leadsAfterD = await queryLeadsByVisitor(visitorId);
  audit.flow.d = {
    description: "Webhook Telegram activa telegram_activo=true",
    webhook_request_response: stepD,
    supabase_state_after_step: {
      leads_row: leadsAfterD
    }
  };
  assertOrThrow(stepD.response.status === 200, `Paso d: webhook status=200`);
  assertOrThrow(stepD.response.body_json && stepD.response.body_json.telegram_activo === true, `Paso d: webhook marca telegram_activo=true`);

  const ofRequestId = crypto.randomUUID();
  const stepE = await callProxyPost("?target=track", {
    request_id: ofRequestId,
    visitor_id: visitorId,
    fingerprint_hash: fingerprint,
    utm_source: utm,
    idioma,
    dispositivo,
    user_agent: "audit-script",
    ip_hash: null,
    boton_clickado: "onlyfans",
    modelo_id: MODEL_ID,
    timestamp: new Date().toISOString()
  });
  const eventosAfterE = await queryEventosByVisitor(visitorId);
  audit.flow.e = {
    description: "Click OnlyFans: track evento onlyfans",
    track_request_response: stepE,
    supabase_state_after_step: {
      eventos_rows: eventosAfterE
    }
  };
  assertOrThrow(stepE.response.status === 200, `Paso e: track onlyfans status=200`);

  const stepF1 = await callProxyGet(`?target=visitor&fingerprint=${encodeURIComponent(fingerprint)}`);
  const stepF2 = await callProxyPost("?target=invite", {
    visitor_id: visitorId,
    modelo_id: MODEL_ID
  });
  const leadsAfterF = await queryLeadsByVisitor(visitorId);
  audit.flow.f = {
    description: "Usuario vuelve sin cookie: recupera visitor_id por fingerprint y reutiliza invite",
    visitor_lookup_request_response: stepF1,
    invite_reuse_request_response: stepF2,
    supabase_state_after_step: {
      leads_row: leadsAfterF
    }
  };
  assertOrThrow(stepF1.response.status === 200, `Paso f: visitor lookup status=200`);
  assertOrThrow(stepF1.response.body_json && stepF1.response.body_json.visitor_id === visitorId, `Paso f: visitor recuperado por fingerprint`);
  assertOrThrow(stepF2.response.status === 200, `Paso f: invite reuse status=200`);
  assertOrThrow(stepF2.response.body_json && stepF2.response.body_json.reused === true, `Paso f: invite reused=true`);
  assertOrThrow(stepF2.response.body_json && stepF2.response.body_json.invite_link === inviteLink, `Paso f: invite link se reutiliza`);
  assertOrThrow(Array.isArray(leadsAfterF.body_json) && leadsAfterF.body_json.length === 1, `Paso f: no se crea fila duplicada en leads`);

  audit.meta.flow_ids = {
    telegram_request_id: tgRequestId,
    onlyfans_request_id: ofRequestId,
    invite_link: inviteLink
  };
}

async function runEdgeCases() {
  const duplicateVisitorId = crypto.randomUUID();
  const duplicateRequestId = crypto.randomUUID();
  const duplicateFingerprint = `dup_${crypto.randomUUID().replace(/-/g, "")}`;

  const duplicatePayload = {
    request_id: duplicateRequestId,
    visitor_id: duplicateVisitorId,
    fingerprint_hash: duplicateFingerprint,
    utm_source: "edge",
    idioma: "es",
    dispositivo: "mobile",
    user_agent: "audit-edge",
    ip_hash: null,
    boton_clickado: "telegram",
    modelo_id: MODEL_ID,
    timestamp: new Date().toISOString()
  };

  const dup1 = await callProxyPost("?target=track", duplicatePayload);
  const dup2 = await callProxyPost("?target=track", duplicatePayload);
  const dupCheckRes = await fetch(
    `${REST}/eventos?select=request_id&request_id=eq.${duplicateRequestId}`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    }
  );
  const dupCheck = await parseResponse(dupCheckRes);
  audit.edge_cases.duplicate_request_id = {
    first_call: dup1,
    second_call: dup2,
    db_check: dupCheck
  };
  assertOrThrow(dup1.response.status === 200 && dup2.response.status === 200, "Edge duplicate request_id: ambas llamadas 200");
  assertOrThrow(Array.isArray(dupCheck.body_json) && dupCheck.body_json.length === 1, "Edge duplicate request_id: solo 1 fila en eventos");

  const webhookUnknownInvite = await callProxyPost(
    "?target=telegram-webhook",
    {
      update_id: Date.now() + 10,
      chat_member: {
        new_chat_member: { status: "member" },
        invite_link: { invite_link: "https://t.me/+unknown_for_edge_case" }
      }
    },
    { "x-telegram-bot-api-secret-token": TELEGRAM_WEBHOOK_SECRET }
  );
  audit.edge_cases.webhook_unknown_visitor_or_invite = webhookUnknownInvite;
  assertOrThrow(webhookUnknownInvite.response.status === 200, "Edge webhook invite desconocido: responde 200");

  const reuseVisitor = `edge-invite-${Date.now()}`;
  const firstInvite = await callProxyPost("?target=invite", { visitor_id: reuseVisitor, modelo_id: MODEL_ID });
  const secondInvite = await callProxyPost("?target=invite", { visitor_id: reuseVisitor, modelo_id: MODEL_ID });
  const thirdInvite = await callProxyPost("?target=invite", { visitor_id: reuseVisitor, modelo_id: MODEL_ID });
  audit.edge_cases.invite_same_visitor_three_calls = {
    first_call: firstInvite,
    second_call: secondInvite,
    third_call: thirdInvite
  };

  const link1 = firstInvite.response.body_json?.invite_link;
  const link2 = secondInvite.response.body_json?.invite_link;
  const link3 = thirdInvite.response.body_json?.invite_link;
  assertOrThrow(firstInvite.response.status === 200 && secondInvite.response.status === 200 && thirdInvite.response.status === 200, "Edge invite x3: todas 200");
  assertOrThrow(link1 && link1 === link2 && link2 === link3, "Edge invite x3: mismo link en todas");
  assertOrThrow(secondInvite.response.body_json?.reused === true && thirdInvite.response.body_json?.reused === true, "Edge invite x3: reused=true desde segunda llamada");

  const unknownFp = `unknown_fp_${crypto.randomUUID().replace(/-/g, "")}`;
  const unknownFpLookup = await callProxyGet(`?target=visitor&fingerprint=${encodeURIComponent(unknownFp)}`);
  audit.edge_cases.unknown_fingerprint = unknownFpLookup;
  assertOrThrow(unknownFpLookup.response.status === 200, "Edge unknown fingerprint: status 200");
  assertOrThrow(unknownFpLookup.response.body_json && unknownFpLookup.response.body_json.visitor_id === null, "Edge unknown fingerprint: visitor_id null");
}

async function runFinalQueries() {
  audit.final_queries.leads = await finalQueryLeads();
  audit.final_queries.eventos = await finalQueryEventos();
  assertOrThrow(audit.final_queries.leads.status === 200, "Final query leads status=200");
  assertOrThrow(audit.final_queries.eventos.status === 200, "Final query eventos status=200");
}

async function main() {
  await runFlow();
  await runEdgeCases();
  await runFinalQueries();

  audit.meta.finished_at = new Date().toISOString();
  audit.meta.ok = true;

  console.log(JSON.stringify(audit, null, 2));
}

main().catch((error) => {
  audit.meta.finished_at = new Date().toISOString();
  audit.meta.ok = false;
  audit.meta.error = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify(audit, null, 2));
  process.exit(1);
});
