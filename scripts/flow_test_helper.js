const fs = require('fs');
const path = require('path');

const IDS_PATH = path.join(__dirname, '.flow_test_ids.json');

function loadEnv(filePath) {
  const env = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    env[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return env;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function upsertLead(base, key, row) {
  const url = `${base}/rest/v1/leads?on_conflict=visitor_id`;
  const payload = JSON.stringify([row]);
  return requestJson(url, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: payload
  });
}

async function getLead(base, key, visitorId) {
  const select = [
    'visitor_id',
    'utm_source',
    'telegram_activo',
    'of_activo',
    'mgo_directo',
    'mgo_en_canal',
    'active_flow',
    'winback_sent',
    'telegram_user_id',
    'pais',
    'ciudad',
    'last_bot_action',
    'updated_at',
    'created_at'
  ].join(',');

  const url = `${base}/rest/v1/leads?visitor_id=eq.${encodeURIComponent(visitorId)}&select=${encodeURIComponent(select)}`;
  return requestJson(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });
}

async function deleteLead(base, key, visitorId) {
  const url = `${base}/rest/v1/leads?visitor_id=eq.${encodeURIComponent(visitorId)}`;
  return requestJson(url, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=minimal'
    }
  });
}

function makeIds() {
  const suffix = Math.random().toString(16).slice(2, 10);
  return {
    flow1: `qa_flow1_${suffix}`,
    flow2: `qa_flow2_${suffix}`,
    flow3: `qa_flow3_${suffix}`,
    flow4: `qa_flow4_${suffix}`,
    flow5: `qa_flow5_${suffix}`,
    flow6: `qa_flow6_${suffix}`,
    geo: `qa_geo_${suffix}`
  };
}

async function setup(base, key) {
  const ids = makeIds();
  const now = new Date();
  const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

  const common = {
    fingerprint_hash: null,
    modelo_id: 'MODEL_ID_PLACEHOLDER',
    idioma: 'es',
    dispositivo: 'mobile',
    user_agent: null,
    winback_sent: false,
    active_flow: null
  };

  const rows = [
    {
      ...common,
      visitor_id: ids.flow1,
      utm_source: 'mgo',
      telegram_activo: false,
      of_activo: false,
      mgo_directo: true,
      mgo_en_canal: false,
      telegram_user_id: '777001'
    },
    {
      ...common,
      visitor_id: ids.flow2,
      utm_source: 'mgo',
      telegram_activo: false,
      of_activo: false,
      mgo_directo: false,
      mgo_en_canal: true,
      telegram_user_id: '777002'
    },
    {
      ...common,
      visitor_id: ids.flow3,
      utm_source: 'instagram',
      telegram_activo: true,
      of_activo: false,
      mgo_directo: false,
      mgo_en_canal: false,
      telegram_user_id: '777003'
    },
    {
      ...common,
      visitor_id: ids.flow4,
      utm_source: 'direct',
      telegram_activo: true,
      of_activo: true,
      mgo_directo: false,
      mgo_en_canal: false,
      telegram_user_id: '777004'
    },
    {
      ...common,
      visitor_id: ids.flow5,
      utm_source: 'mgo',
      telegram_activo: false,
      of_activo: false,
      mgo_directo: true,
      mgo_en_canal: false,
      telegram_user_id: '777005',
      updated_at: old,
      created_at: old
    },
    {
      ...common,
      visitor_id: ids.flow6,
      utm_source: 'mgo',
      telegram_activo: true,
      of_activo: false,
      mgo_directo: true,
      mgo_en_canal: false,
      telegram_user_id: '777006'
    }
  ];

  console.log('SETUP_INSERT_RESULTS');
  for (const row of rows) {
    const result = await upsertLead(base, key, row);
    console.log(row.visitor_id, 'STATUS', result.status);
  }

  fs.writeFileSync(IDS_PATH, JSON.stringify(ids, null, 2), 'utf8');
  console.log('IDS_FILE', IDS_PATH);

  console.log('BEFORE_STATE');
  for (const [flow, visitorId] of Object.entries(ids).filter(([k]) => k !== 'geo')) {
    const result = await getLead(base, key, visitorId);
    console.log(flow, JSON.stringify(result.body));
  }
}

async function after(base, key) {
  if (!fs.existsSync(IDS_PATH)) {
    throw new Error('Missing .flow_test_ids.json. Run setup first.');
  }
  const ids = JSON.parse(fs.readFileSync(IDS_PATH, 'utf8'));

  console.log('AFTER_STATE');
  for (const [flow, visitorId] of Object.entries(ids).filter(([k]) => k !== 'geo')) {
    const result = await getLead(base, key, visitorId);
    console.log(flow, JSON.stringify(result.body));
  }
}

async function geo(base, key) {
  if (!fs.existsSync(IDS_PATH)) {
    throw new Error('Missing .flow_test_ids.json. Run setup first.');
  }
  const ids = JSON.parse(fs.readFileSync(IDS_PATH, 'utf8'));
  const visitor = ids.geo;

  const payload = {
    request_id: crypto.randomUUID(),
    visitor_id: visitor,
    fingerprint_hash: 'qa_fingerprint_geo',
    utm_source: 'instagram',
    idioma: 'es',
    dispositivo: 'mobile',
    user_agent: 'qa-geo-agent',
    boton_clickado: 'telegram',
    modelo_id: 'modelo_qa',
    timestamp: new Date().toISOString()
  };

  const track = await requestJson(`${base}/functions/v1/api-proxy?target=track`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  await new Promise((r) => setTimeout(r, 2500));
  const lead = await getLead(base, key, visitor);

  console.log('GEO_TRACK_STATUS', track.status, JSON.stringify(track.body));
  console.log('GEO_LEAD', JSON.stringify(lead.body));
}

async function cleanup(base, key) {
  if (!fs.existsSync(IDS_PATH)) {
    console.log('NO_IDS_FILE');
    return;
  }
  const ids = JSON.parse(fs.readFileSync(IDS_PATH, 'utf8'));

  console.log('CLEANUP_RESULTS');
  for (const visitorId of Object.values(ids)) {
    const result = await deleteLead(base, key, visitorId);
    console.log(visitorId, 'STATUS', result.status);
  }

  fs.unlinkSync(IDS_PATH);
  console.log('IDS_FILE_REMOVED');
}

async function main() {
  const env = loadEnv(path.join(process.cwd(), '.env'));
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');

  const mode = process.argv[2];
  if (mode === 'setup') return setup(base, key);
  if (mode === 'after') return after(base, key);
  if (mode === 'geo') return geo(base, key);
  if (mode === 'cleanup') return cleanup(base, key);

  throw new Error('Usage: node scripts/flow_test_helper.js [setup|after|geo|cleanup]');
}

main().catch((err) => {
  console.error('FLOW_TEST_ERROR', err.message || err);
  process.exit(1);
});
