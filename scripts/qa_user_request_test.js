const fs = require('fs');
const path = require('path');

function loadEnv(filePath) {
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function headers(key, contentType = false) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(contentType ? { 'content-type': 'application/json' } : {})
  };
}

const FLOW_IDS = ['qa-f1', 'qa-f2', 'qa-f3', 'qa-f4', 'qa-f5', 'qa-f6'];

async function cleanup(base, key) {
  for (const id of FLOW_IDS) {
    await requestJson(`${base}/rest/v1/leads?visitor_id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { ...headers(key), Prefer: 'return=minimal' }
    });
  }
}

async function insertRows(base, key) {
  const rows = [
    {
      visitor_id: 'qa-f1',
      modelo_id: 'MODEL_ID_PLACEHOLDER',
      utm_source: 'mgo',
      mgo_directo: true,
      of_activo: false,
      active_flow: null,
      telegram_user_id: '777001',
      updated_at: new Date().toISOString()
    },
    {
      visitor_id: 'qa-f2',
      modelo_id: 'MODEL_ID_PLACEHOLDER',
      utm_source: 'mgo',
      mgo_en_canal: true,
      of_activo: false,
      active_flow: null,
      telegram_user_id: '777002',
      updated_at: new Date().toISOString()
    },
    {
      visitor_id: 'qa-f3',
      modelo_id: 'MODEL_ID_PLACEHOLDER',
      utm_source: 'instagram',
      telegram_activo: true,
      mgo_directo: false,
      mgo_en_canal: false,
      of_activo: false,
      active_flow: null,
      telegram_user_id: '777003',
      updated_at: new Date().toISOString()
    },
    {
      visitor_id: 'qa-f4',
      modelo_id: 'MODEL_ID_PLACEHOLDER',
      utm_source: 'instagram',
      of_activo: true,
      telegram_activo: true,
      active_flow: null,
      telegram_user_id: '777004',
      updated_at: new Date().toISOString()
    },
    {
      visitor_id: 'qa-f5',
      modelo_id: 'MODEL_ID_PLACEHOLDER',
      utm_source: 'mgo',
      mgo_directo: true,
      of_activo: false,
      winback_sent: false,
      telegram_user_id: '777005',
      updated_at: '2026-03-01T00:00:00Z'
    },
    {
      visitor_id: 'qa-f6',
      modelo_id: 'MODEL_ID_PLACEHOLDER',
      utm_source: 'instagram',
      telegram_activo: true,
      mgo_directo: true,
      of_activo: false,
      active_flow: null,
      telegram_user_id: '777006',
      updated_at: new Date().toISOString()
    }
  ];

  for (const row of rows) {
    const result = await requestJson(`${base}/rest/v1/leads?on_conflict=visitor_id`, {
      method: 'POST',
      headers: {
        ...headers(key, true),
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify([row])
    });
    console.log('INSERT', row.visitor_id, 'STATUS', result.status);
  }
}

async function show(base, key, label) {
  const select = encodeURIComponent('visitor_id,active_flow,winback_sent,last_bot_action,updated_at');
  console.log(label);
  for (const id of FLOW_IDS) {
    const result = await requestJson(`${base}/rest/v1/leads?visitor_id=eq.${encodeURIComponent(id)}&select=${select}`, {
      headers: headers(key)
    });
    const row = Array.isArray(result.body) ? result.body[0] : null;
    console.log(id, JSON.stringify(row));
  }
}

async function main() {
  const env = loadEnv(path.join(process.cwd(), '.env'));
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const mode = process.argv[2];
  if (mode === 'setup') {
    await cleanup(base, key);
    await insertRows(base, key);
    await show(base, key, 'BEFORE_ACTIVE_FLOW');
    return;
  }
  if (mode === 'show') {
    await show(base, key, 'CURRENT_ACTIVE_FLOW');
    return;
  }
  if (mode === 'cleanup') {
    await cleanup(base, key);
    console.log('CLEANUP_DONE');
    return;
  }

  throw new Error('Usage: node scripts/qa_user_request_test.js [setup|show|cleanup]');
}

main().catch((err) => {
  console.error('QA_TEST_ERROR', err.message || err);
  process.exit(1);
});
