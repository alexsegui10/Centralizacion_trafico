const fs = require('fs');

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
  const visitorId = process.argv[2];
  if (!visitorId) throw new Error('Usage: node scripts/query_lead_geo.js <visitor_id>');

  const env = loadEnv('.env');
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  const select = encodeURIComponent('visitor_id,pais,ciudad,updated_at,created_at');
  const res = await fetch(`${base}/rest/v1/leads?visitor_id=eq.${encodeURIComponent(visitorId)}&select=${select}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });

  console.log('STATUS', res.status);
  console.log(await res.text());
}

main().catch((err) => {
  console.error('QUERY_LEAD_ERROR', err.message || err);
  process.exit(1);
});
