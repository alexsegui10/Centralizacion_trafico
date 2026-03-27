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
  const env = loadEnv('.env');
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  const del = await fetch(`${base}/rest/v1/leads?visitor_id=like.qa-*`, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'return=minimal'
    }
  });

  const chk = await fetch(`${base}/rest/v1/leads?visitor_id=like.qa-*&select=visitor_id`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });

  console.log('DELETE_QA_WILDCARD_STATUS', del.status);
  console.log('QA_LEFT', await chk.text());
}

main().catch((err) => {
  console.error('CLEANUP_WILDCARD_ERROR', err.message || err);
  process.exit(1);
});
