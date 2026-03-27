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
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const secret = env.EDGE_HMAC_SECRET;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = env.SUPABASE_ANON_KEY || '';

  const visitorId = 'qa-geo-ip8888';
  const body = JSON.stringify({
    request_id: crypto.randomUUID(),
    visitor_id: visitorId,
    fingerprint_hash: 'qa_geo_fp',
    utm_source: 'instagram',
    idioma: 'es',
    dispositivo: 'mobile',
    user_agent: 'qa-geo',
    boton_clickado: 'telegram',
    modelo_id: 'MODEL_ID_PLACEHOLDER',
    timestamp: new Date().toISOString()
  });

  const ts = Math.floor(Date.now() / 1000).toString();
  const canonical = `POST\n/api/track\n${ts}\n${body}`;
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

  const trackRes = await fetch(`${base}/functions/v1/api-track`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-timestamp': ts,
      'x-signature': signature,
      'cf-connecting-ip': '8.8.8.8',
      ...(anon ? { apikey: anon, Authorization: `Bearer ${anon}` } : {})
    },
    body
  });

  console.log('TRACK_STATUS', trackRes.status, await trackRes.text());

  await new Promise((resolve) => setTimeout(resolve, 2500));

  const leadRes = await fetch(
    `${base}/rest/v1/leads?visitor_id=eq.${encodeURIComponent(visitorId)}&select=visitor_id,pais,ciudad,updated_at`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );

  console.log('GEO_LEAD', await leadRes.text());
}

main().catch((err) => {
  console.error('GEO_TEST_ERROR', err.message || err);
  process.exit(1);
});
