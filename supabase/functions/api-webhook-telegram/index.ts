// @ts-nocheck

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse, getRequiredEnv } from "../_shared/security.ts";

type TelegramUpdate = {
  chat_member?: {
    new_chat_member?: { status?: string; user?: { id?: number | string } };
    old_chat_member?: { user?: { id?: number | string } };
    invite_link?: { invite_link?: string };
  };
};

function normalizeTelegramUserId(input: unknown): string | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    return String(Math.trunc(input));
  }
  if (typeof input === "string" && input.trim()) {
    return input.trim();
  }
  return null;
}

function extractMembershipData(update: TelegramUpdate): { inviteLink: string; telegramUserId: string | null } | null {
  const status = update?.chat_member?.new_chat_member?.status;
  if (status !== "member") {
    return null;
  }

  const inviteLink = update?.chat_member?.invite_link?.invite_link;
  if (!inviteLink || typeof inviteLink !== "string") {
    return null;
  }

  const telegramUserId =
    normalizeTelegramUserId(update?.chat_member?.new_chat_member?.user?.id) ||
    normalizeTelegramUserId(update?.chat_member?.old_chat_member?.user?.id);

  return { inviteLink, telegramUserId };
}

Deno.serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const expectedSecret = getRequiredEnv("TELEGRAM_WEBHOOK_SECRET");
    const providedSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token")?.trim();

    if (!providedSecret || providedSecret !== expectedSecret) {
      return jsonResponse(401, { ok: false, error: "invalid_telegram_secret" });
    }

    let update: TelegramUpdate;
    try {
      update = await req.json();
    } catch {
      return jsonResponse(400, { ok: false, error: "invalid_json" });
    }

    const membershipData = extractMembershipData(update);
    if (!membershipData) {
      return jsonResponse(200, { ok: true, ignored: true });
    }

    const { inviteLink, telegramUserId } = membershipData;

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    // ── MGO CANAL: link dedicado para tráfico de MGO ──────────────────────
    // Configura la var de entorno MGO_CANAL_INVITE_LINK con el link permanente
    // que pon drás en el perfil de Telegram de la modelo (ej: https://t.me/+XXXX)
    const mgoLinkRaw = Deno.env.get("MGO_CANAL_INVITE_LINK") ?? "";
    const isMgoCanal = mgoLinkRaw.length > 0 && inviteLink === mgoLinkRaw.trim();

    if (isMgoCanal) {
      // Intentar encontrar lead existente por telegram_user_id
      let visitorId: string | null = null;

      if (telegramUserId) {
        const { data: existing } = await supabase
          .from("leads")
          .select("visitor_id")
          .eq("telegram_user_id", telegramUserId)
          .limit(1);

        if (existing && existing.length > 0) {
          visitorId = existing[0].visitor_id;
        }
      }

      if (visitorId) {
        // Lead existente → añadir mgo_en_canal=true
        await supabase
          .from("leads")
          .update({
            mgo_en_canal: true,
            telegram_activo: true,
            updated_at: new Date().toISOString(),
          })
          .eq("visitor_id", visitorId);
      } else {
        // Lead nuevo: llegó directo desde Telegram sin pasar por la landing
        visitorId = crypto.randomUUID();
        await supabase.from("leads").insert({
          visitor_id: visitorId,
          mgo_en_canal: true,
          telegram_activo: true,
          telegram_user_id: telegramUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      return jsonResponse(200, {
        ok: true,
        visitor_id: visitorId,
        mgo_en_canal: true,
        telegram_activo: true,
        telegram_user_id: telegramUserId,
        source: "mgo_canal",
      });
    }

    // ── FLUJO NORMAL: invite link personalizado desde la landing ─────────
    const { data: leadRows, error: leadLookupError } = await supabase
      .from("leads")
      .select("visitor_id")
      .eq("invite_link", inviteLink)
      .limit(1);

    if (leadLookupError) {
      return jsonResponse(500, { ok: false, error: "lead_lookup_failed", details: leadLookupError.message });
    }

    if (!leadRows || leadRows.length === 0) {
      return jsonResponse(200, { ok: true, ignored: true, reason: "invite_not_found" });
    }

    const visitorId = leadRows[0].visitor_id;

    const { error: updateError } = await supabase
      .from("leads")
      .update({
        telegram_activo: true,
        telegram_user_id: telegramUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("visitor_id", visitorId);

    if (updateError) {
      return jsonResponse(500, { ok: false, error: "lead_update_failed", details: updateError.message });
    }

    return jsonResponse(200, {
      ok: true,
      visitor_id: visitorId,
      telegram_activo: true,
      telegram_user_id: telegramUserId,
      source: "personalized_link",
    });

  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "internal_error",
      details: error instanceof Error ? error.message : "unknown_error",
    });
  }
});
