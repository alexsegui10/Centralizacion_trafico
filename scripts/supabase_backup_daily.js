const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_TABLES = (process.env.SUPABASE_BACKUP_TABLES || "leads,eventos")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const BACKUP_DIR = process.env.SUPABASE_BACKUP_DIR || path.join("backups", "supabase");
const PAGE_SIZE = Number(process.env.SUPABASE_BACKUP_PAGE_SIZE || 1000);
const KEEP_DAYS = Number(process.env.SUPABASE_BACKUP_KEEP_DAYS || 14);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!Number.isFinite(PAGE_SIZE) || PAGE_SIZE <= 0) {
  console.error("Invalid SUPABASE_BACKUP_PAGE_SIZE");
  process.exit(1);
}

if (!Number.isFinite(KEEP_DAYS) || KEEP_DAYS < 1) {
  console.error("Invalid SUPABASE_BACKUP_KEEP_DAYS");
  process.exit(1);
}

const REST_BASE = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1`;

async function fetchTableRows(tableName) {
  const rows = [];
  let offset = 0;

  while (true) {
    const url = `${REST_BASE}/${encodeURIComponent(tableName)}?select=*&limit=${PAGE_SIZE}&offset=${offset}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`table=${tableName} status=${response.status} body=${text}`);
    }

    let batch;
    try {
      batch = JSON.parse(text);
    } catch {
      throw new Error(`table=${tableName} returned non-JSON body`);
    }

    if (!Array.isArray(batch)) {
      throw new Error(`table=${tableName} expected array response`);
    }

    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return rows;
}

function pruneOldBackups(directoryPath) {
  const files = fs.readdirSync(directoryPath).filter((name) => name.endsWith(".json"));
  const now = Date.now();
  const maxAgeMs = KEEP_DAYS * 24 * 60 * 60 * 1000;

  for (const fileName of files) {
    const filePath = path.join(directoryPath, fileName);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > maxAgeMs) {
      fs.unlinkSync(filePath);
      console.log(`PRUNED ${fileName}`);
    }
  }
}

async function run() {
  const started = Date.now();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const outputPath = path.join(BACKUP_DIR, `supabase_backup_${timestamp}.json`);
  const output = {
    generated_at: new Date().toISOString(),
    project_url: SUPABASE_URL,
    tables: {}
  };

  for (const tableName of BACKUP_TABLES) {
    const rows = await fetchTableRows(tableName);
    output.tables[tableName] = rows;
    console.log(`BACKUP table=${tableName} rows=${rows.length}`);
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");
  pruneOldBackups(BACKUP_DIR);

  console.log(
    "SUPABASE_BACKUP_OK",
    JSON.stringify({
      output: outputPath,
      tables: Object.keys(output.tables),
      total_ms: Date.now() - started
    })
  );
}

run().catch((error) => {
  console.error("SUPABASE_BACKUP_FAIL", error?.message || error);
  process.exit(1);
});
