// @ts-nocheck

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getRequiredEnv,
  handleOptions,
  jsonResponse,
  validateHmacRequest
} from "../_shared/security.ts";

type InviteRequest = {
  visitor_id: string;
  modelo_id: string;
};

type LeadInviteLookup = {
  visitor_id: string;
  invite_link: string | null;
};

function parseInviteBody(input: unknown): { ok: true; data: InviteRequest } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "invalid_body" };
  }

  const body = input as Record<string, unknown>;
  const visitorId = typeof body.visitor_id === "string" ? body.visitor_id.trim() : "";
  const modeloId = typeof body.modelo_id === "string" ? body.modelo_id.trim() : "";

  if (!visitorId) {
    return { ok: false, error: "missing_visitor_id" };
  }

  if (!modeloId) {
    return { ok: false, error: "missing_modelo_id" };
  }

  return {
    ok: true,
    data: {
      visitor_id: visitorId,
      modelo_id: modeloId
    }
  };
}

async function createTelegramInviteLink(params: { botToken: string; channelId: string }): Promise<string> {
  const { botToken, channelId } = params;

  const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/createChatInviteLink`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: channelId,
      member_limit: 1
    })
  });

  const telegramData = await telegramRes.json().catch(() => null);

  if (!telegramRes.ok || !telegramData?.ok || !telegramData?.result?.invite_link) {
    throw new Error(`telegram_invite_error:${telegramData?.description || telegramRes.status}`);
  }

  return String(telegramData.result.invite_link);
}

Deno.serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const rawBody = await req.text();
    const hmacSecret = getRequiredEnv("EDGE_HMAC_SECRET");
    const timestamp = req.headers.get("x-timestamp") ?? "";
    const canonical = `POST\n/api/invite\n${timestamp}\n${rawBody}`;

    const hmacResult = await validateHmacRequest({
      req,
      canonicalPayload: canonical,
      secret: hmacSecret,
      maxAgeSeconds: 300
    });

    if (!hmacResult.ok) {
      return hmacResult.response;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return jsonResponse(400, { ok: false, error: "invalid_json" });
    }

    const parsedBody = parseInviteBody(parsed);
    if (!parsedBody.ok) {
      return jsonResponse(400, { ok: false, error: parsedBody.error });
    }

    const { visitor_id: visitorId, modelo_id: modeloId } = parsedBody.data;

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data: existingRows, error: lookupError } = await supabase
      .from("leads")
      .select("visitor_id, invite_link")
      .eq("visitor_id", visitorId)
      .limit(1)
      .returns<LeadInviteLookup[]>();

    if (lookupError) {
      return jsonResponse(500, { ok: false, error: "lookup_failed", details: lookupError.message });
    }

    const existingInvite = existingRows && existingRows[0]?.invite_link;
    if (existingInvite) {
      return jsonResponse(200, { invite_link: existingInvite, reused: true });
    }

    const botToken = getRequiredEnv("TELEGRAM_BOT_TOKEN");
    const channelId = getRequiredEnv("TELEGRAM_CHANNEL_ID");
    const inviteLink = await createTelegramInviteLink({ botToken, channelId });

    const leadUpsert = {
      visitor_id: visitorId,
      modelo_id: modeloId,
      invite_link: inviteLink,
      invite_link_created_at: new Date().toISOString()
    };

    const { error: upsertError } = await supabase
      .from("leads")
      .upsert(leadUpsert, { onConflict: "visitor_id", ignoreDuplicates: false });

    if (upsertError) {
      return jsonResponse(500, { ok: false, error: "upsert_failed", details: upsertError.message });
    }

    return jsonResponse(200, { invite_link: inviteLink, reused: false });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "internal_error",
      details: error instanceof Error ? error.message : "unknown_error"
    });
  }
});
