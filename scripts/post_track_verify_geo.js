const fs = require('fs');
const crypto = require('crypto');

function loadEnv(filePath) {
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

async function main() {
  const env = loadEnv('.env');
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const visitorId = `qa-geo-live-${Date.now()}`;
  const payload = {
    request_id: crypto.randomUUID(),
    visitor_id: visitorId,
    fingerprint_hash: `fp_${Math.random().toString(16).slice(2)}`,
    utm_source: 'instagram',
    idioma: 'es',
    dispositivo: 'mobile',
    user_agent: 'qa-post-track-verify',
    boton_clickado: 'telegram',
    modelo_id: 'MODEL_ID_PLACEHOLDER',
    timestamp: new Date().toISOString()
  };

  const trackRes = await fetch(`${base}/functions/v1/api-proxy?target=track`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const trackText = await trackRes.text();
  console.log('TRACK_STATUS', trackRes.status);
  console.log('TRACK_BODY', trackText);
  console.log('VISITOR_ID', visitorId);

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const select = encodeURIComponent('visitor_id,pais,ciudad,updated_at,created_at');
  const leadRes = await fetch(
    `${base}/rest/v1/leads?visitor_id=eq.${encodeURIComponent(visitorId)}&select=${select}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    }
  );

  console.log('LEAD_STATUS', leadRes.status);
  console.log('LEAD_BODY', await leadRes.text());
}

main().catch((err) => {
  console.error('POST_TRACK_VERIFY_ERROR', err.message || err);
  process.exit(1);
});
