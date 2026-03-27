const crypto = require('crypto');

(async () => {
  const base = 'https://krnabtkugfzfinwvfuzm.supabase.co';
  const anon = process.env.SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const channel = process.env.TELEGRAM_CHANNEL_ID || '-1003698170374';

  if (!anon || !svc || !secret) {
    console.error('Missing env vars');
    process.exit(1);
  }

  const vid = `test-f25-final-${Date.now()}`;
  const fp = `fp_${vid}`;
  const proxy = `${base}/functions/v1/api-proxy`;
  const rest = `${base}/rest/v1`;
  const ah = { apikey: anon, Authorization: `Bearer ${anon}` };
  const sh = { apikey: svc, Authorization: `Bearer ${svc}` };

  await fetch(`${rest}/eventos?visitor_id=eq.${encodeURIComponent(vid)}`, { method: 'DELETE', headers: sh });
  await fetch(`${rest}/leads?visitor_id=eq.${encodeURIComponent(vid)}`, { method: 'DELETE', headers: sh });

  const visitorText = await (await fetch(`${proxy}?target=visitor&fingerprint=${encodeURIComponent(fp)}`, { headers: ah })).text();

  const inviteRes = await (await fetch(`${proxy}?target=invite`, {
    method: 'POST',
    headers: { ...ah, 'content-type': 'application/json' },
    body: JSON.stringify({ visitor_id: vid, modelo_id: 'MODEL_ID_PLACEHOLDER' })
  })).json();

  const trackPayload = {
    request_id: crypto.randomUUID(),
    visitor_id: vid,
    fingerprint_hash: fp,
    utm_source: 'reddit',
    idioma: 'es',
    dispositivo: 'mobile',
    user_agent: 'f25-final',
    ip_hash: null,
    boton_clickado: 'telegram',
    modelo_id: 'MODEL_ID_PLACEHOLDER',
    timestamp: new Date().toISOString()
  };

  const trackText = await (await fetch(`${proxy}?target=track`, {
    method: 'POST',
    headers: { ...ah, 'content-type': 'application/json' },
    body: JSON.stringify(trackPayload)
  })).text();

  const webhookPayload = {
    update_id: Date.now(),
    chat_member: {
      chat: { id: Number(channel), type: 'channel' },
      from: { id: 1, is_bot: false, first_name: 'T' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'left', user: { id: 999777, is_bot: false, first_name: 'L' } },
      new_chat_member: { status: 'member', user: { id: 999777, is_bot: false, first_name: 'L' } },
      invite_link: { invite_link: inviteRes.invite_link }
    }
  };

  const webhookText = await (await fetch(`${proxy}?target=telegram-webhook`, {
    method: 'POST',
    headers: { ...ah, 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: JSON.stringify(webhookPayload)
  })).text();

  await new Promise((resolve) => setTimeout(resolve, 340000));

  const leadText = await (await fetch(`${rest}/leads?select=visitor_id,utm_source,telegram_activo,telegram_user_id,active_flow,last_bot_action,updated_at&visitor_id=eq.${encodeURIComponent(vid)}`, { headers: sh })).text();

  const out = {
    vid,
    visitor_lookup: visitorText,
    invite: inviteRes,
    track: trackText,
    webhook: webhookText,
    final_lead: JSON.parse(leadText)
  };

  console.log(JSON.stringify(out, null, 2));
})();
