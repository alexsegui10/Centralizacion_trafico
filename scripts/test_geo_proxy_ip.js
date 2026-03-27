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
  const visitorId = 'qa-geo-proxy-8888';

  const payload = {
    request_id: crypto.randomUUID(),
    visitor_id: visitorId,
    fingerprint_hash: 'qa_geo_proxy_fp',
    utm_source: 'instagram',
    idioma: 'es',
    dispositivo: 'mobile',
    user_agent: 'qa-geo-proxy',
    boton_clickado: 'telegram',
    modelo_id: 'MODEL_ID_PLACEHOLDER',
    timestamp: new Date().toISOString()
  };

  const track = await fetch(`${base}/functions/v1/api-proxy?target=track`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': '8.8.8.8',
      'x-forwarded-for': '8.8.8.8',
      'x-real-ip': '8.8.8.8'
    },
    body: JSON.stringify(payload)
  });

  console.log('TRACK_STATUS', track.status, await track.text());

  await new Promise((resolve) => setTimeout(resolve, 2500));

  const lead = await fetch(
    `${base}/rest/v1/leads?visitor_id=eq.${encodeURIComponent(visitorId)}&select=visitor_id,pais,ciudad,updated_at`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );

  console.log('GEO_LEAD', await lead.text());
}

main().catch((err) => {
  console.error('GEO_PROXY_TEST_ERROR', err.message || err);
  process.exit(1);
});
