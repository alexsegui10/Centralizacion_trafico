const { spawnSync } = require("child_process");

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || "";

function runSmoke() {
  const result = spawnSync(process.execPath, ["scripts/smoke_daily.js"], {
    encoding: "utf8",
    env: process.env
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    throw new Error(`smoke_daily failed with code ${result.status}`);
  }
}

async function runExternalAlertCheck() {
  if (!ALERT_WEBHOOK_URL) {
    console.log("SKIP external_alert_check (set ALERT_WEBHOOK_URL to enable)");
    return;
  }

  const response = await fetch(ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "daily-healthcheck" })
  });

  const text = await response.text();
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`external_alert_check status=${response.status} body=${text}`);
  }

  console.log("PASS external_alert_check", JSON.stringify({ status: response.status, body: text }));
}

async function main() {
  const started = Date.now();
  runSmoke();
  await runExternalAlertCheck();
  console.log("HEALTH_DAILY_OK", JSON.stringify({ total_ms: Date.now() - started }));
}

main().catch((error) => {
  console.error("HEALTH_DAILY_FAIL", error?.message || error);
  process.exit(1);
});
