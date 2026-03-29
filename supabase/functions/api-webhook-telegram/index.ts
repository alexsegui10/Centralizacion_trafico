// @ts-nocheck

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleOptions, jsonResponse, getRequiredEnv } from "../_shared/security.ts";

type TelegramUpdate = {
  chat_member?: {
    new_chat_member?: { status?: string; user?: { id?: number | string } };
    old_chat_member?: { user?: { id?: number | string } };
    invite_link?: { invite_link?: string };
  };
  message?: {
    from?: { id?: number | string };
    text?: string;
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
  if (status !== "member") return null; // left/kicked/banned handled separately below

  const inviteLink = update?.chat_member?.invite_link?.invite_link;
  if (!inviteLink || typeof inviteLink !== "string") return null;

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

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const now = new Date().toISOString();

    // ══════════════════════════════════════════════════════════════════════
    // RAMA A: DM directo al bot (update.message)
    // ══════════════════════════════════════════════════════════════════════
    if (update?.message?.from?.id != null) {
      const telegramUserId = normalizeTelegramUserId(update.message.from.id);

      if (!telegramUserId) {
        return jsonResponse(200, { ok: true, ignored: true, reason: "no_user_id" });
      }

      const { data: existing } = await supabase
        .from("leads")
        .select("visitor_id, telegram_activo, mgo_directo, of_activo, active_flow")
        .eq("telegram_user_id", telegramUserId)
        .limit(1);

      if (existing && existing.length > 0) {
        const lead = existing[0];

        // Guard: VIP (ya compró OF) → nunca tocar
        if (lead.of_activo) {
          return jsonResponse(200, {
            ok: true,
            visitor_id: lead.visitor_id,
            source: "direct_message_vip",
            flow: "none"
          });
        }

        // Ya está en el canal (telegram_activo=true) → vino de redes → CupidBot lo gestiona
        if (lead.telegram_activo) {
          return jsonResponse(200, {
            ok: true,
            visitor_id: lead.visitor_id,
            source: "direct_message_in_canal",
            flow: "cupidbot"
          });
        }

        // No está en el canal, no ha comprado, y no tiene flujo activo → mgo_directo → bot_ventas
        if (!lead.active_flow) {
          await supabase
            .from("leads")
            .update({
              mgo_directo: true,
              telegram_activo: true,
              telegram_joined_at: now,
              updated_at: now
            })
            .eq("visitor_id", lead.visitor_id);
        }

        return jsonResponse(200, {
          ok: true,
          visitor_id: lead.visitor_id,
          source: "direct_message_mgo_directo",
          flow: "bot_ventas"
        });

      } else {
        // Lead nuevo: escribe directo sin pasar por la landing
        const visitorId = crypto.randomUUID();
        await supabase.from("leads").insert({
          visitor_id: visitorId,
          mgo_directo: true,
          telegram_activo: true,
          telegram_joined_at: now,
          telegram_user_id: telegramUserId,
          created_at: now,
          updated_at: now
        });

        return jsonResponse(200, {
          ok: true,
          visitor_id: visitorId,
          source: "direct_message_new_lead",
          flow: "bot_ventas"
        });
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // RAMA B: Eventos del canal (update.chat_member)
    // ══════════════════════════════════════════════════════════════════════

    // ── Sub-rama: Alguien SALE o es EXPULSADO del canal ───────────────────
    const leaveStatus = update?.chat_member?.new_chat_member?.status;
    if (leaveStatus === "left" || leaveStatus === "kicked" || leaveStatus === "banned") {
      const leavingUserId =
        normalizeTelegramUserId(update?.chat_member?.new_chat_member?.user?.id) ||
        normalizeTelegramUserId(update?.chat_member?.old_chat_member?.user?.id);

      if (leavingUserId) {
        // Solo resetear si no está en flujo activo (si está en F3/F1/F2, el bot lo gestiona)
        const { data: leavingLead } = await supabase
          .from("leads")
          .select("visitor_id, active_flow, of_activo")
          .eq("telegram_user_id", leavingUserId)
          .limit(1);

        if (leavingLead && leavingLead.length > 0) {
          const lead = leavingLead[0];
          // Si no hay flujo activo y no es VIP, marcar como inactivo en Telegram
          if (!lead.active_flow && !lead.of_activo) {
            await supabase
              .from("leads")
              .update({ telegram_activo: false, updated_at: now })
              .eq("visitor_id", lead.visitor_id);
          }
        }
      }

      return jsonResponse(200, { ok: true, event: "member_left" });
    }

    // ── Sub-rama: Alguien ENTRA al canal via invite link ──────────────────
    const membershipData = extractMembershipData(update);
    if (!membershipData) {
      return jsonResponse(200, { ok: true, ignored: true });
    }

    const { inviteLink, telegramUserId } = membershipData;

    // ── MGO CANAL: link permanente → mgo_en_canal=true → bot_ventas ──────
    const mgoLinkRaw = Deno.env.get("MGO_CANAL_INVITE_LINK") ?? "";
    const isMgoCanal = mgoLinkRaw.length > 0 && inviteLink === mgoLinkRaw.trim();

    if (isMgoCanal) {
      let visitorId: string | null = null;
      let existingOfActivo = false;

      if (telegramUserId) {
        const { data: existing } = await supabase
          .from("leads")
          .select("visitor_id, of_activo")
          .eq("telegram_user_id", telegramUserId)
          .limit(1);

        if (existing && existing.length > 0) {
          visitorId = existing[0].visitor_id;
          existingOfActivo = !!existing[0].of_activo;
        }
      }

      // Guard: VIP → no tocar
      if (existingOfActivo) {
        return jsonResponse(200, {
          ok: true,
          visitor_id: visitorId,
          source: "mgo_canal_vip",
          flow: "none"
        });
      }

      if (visitorId) {
        await supabase
          .from("leads")
          .update({
            mgo_en_canal: true,
            telegram_activo: true,
            telegram_joined_at: now,
            updated_at: now
          })
          .eq("visitor_id", visitorId);
      } else {
        visitorId = crypto.randomUUID();
        await supabase.from("leads").insert({
          visitor_id: visitorId,
          mgo_en_canal: true,
          telegram_activo: true,
          telegram_joined_at: now,
          telegram_user_id: telegramUserId,
          created_at: now,
          updated_at: now
        });
      }

      return jsonResponse(200, {
        ok: true,
        visitor_id: visitorId,
        mgo_en_canal: true,
        telegram_activo: true,
        telegram_user_id: telegramUserId,
        source: "mgo_canal"
      });
    }

    // ── SOCIAL CANAL: link fijo para socios/redes → telegram_activo=true → CupidBot ──
    // No pone mgo_en_canal=true, así que va al Flow 3 (CupidBot) tras 3 días
    const socialLinkRaw = Deno.env.get("SOCIAL_CANAL_INVITE_LINK") ?? "";
    const isSocialCanal = socialLinkRaw.length > 0 && inviteLink === socialLinkRaw.trim();

    if (isSocialCanal) {
      let visitorId: string | null = null;
      let existingOfActivo = false;

      if (telegramUserId) {
        const { data: existing } = await supabase
          .from("leads")
          .select("visitor_id, of_activo")
          .eq("telegram_user_id", telegramUserId)
          .limit(1);

        if (existing && existing.length > 0) {
          visitorId = existing[0].visitor_id;
          existingOfActivo = !!existing[0].of_activo;
        }
      }

      // Guard: VIP → no tocar
      if (existingOfActivo) {
        return jsonResponse(200, {
          ok: true,
          visitor_id: visitorId,
          source: "social_canal_vip",
          flow: "none"
        });
      }

      if (visitorId) {
        await supabase
          .from("leads")
          .update({
            telegram_activo: true,
            telegram_joined_at: now,
            updated_at: now
          })
          .eq("visitor_id", visitorId);
      } else {
        visitorId = crypto.randomUUID();
        await supabase.from("leads").insert({
          visitor_id: visitorId,
          telegram_activo: true,
          mgo_directo: false,
          mgo_en_canal: false,
          telegram_joined_at: now,
          telegram_user_id: telegramUserId,
          created_at: now,
          updated_at: now
        });
      }

      return jsonResponse(200, {
        ok: true,
        visitor_id: visitorId,
        telegram_activo: true,
        telegram_user_id: telegramUserId,
        source: "social_canal"
      });
    }

    // ── Invite link personalizado desde la landing ─────────────────────────
    const { data: leadRows, error: leadLookupError } = await supabase
      .from("leads")
      .select("visitor_id, of_activo")
      .eq("invite_link", inviteLink)
      .limit(1);

    if (leadLookupError) {
      return jsonResponse(500, { ok: false, error: "lead_lookup_failed", details: leadLookupError.message });
    }

    if (!leadRows || leadRows.length === 0) {
      return jsonResponse(200, { ok: true, ignored: true, reason: "invite_not_found" });
    }

    const { visitor_id: visitorId, of_activo: leadOfActivo } = leadRows[0];

    // Guard: VIP → no tocar
    if (leadOfActivo) {
      return jsonResponse(200, {
        ok: true,
        visitor_id: visitorId,
        source: "personalized_link_vip",
        flow: "none"
      });
    }

    const { error: updateError } = await supabase
      .from("leads")
      .update({
        telegram_activo: true,
        telegram_joined_at: now,
        telegram_user_id: telegramUserId,
        updated_at: now
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
      source: "personalized_link"
    });

  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "internal_error",
      details: error instanceof Error ? error.message : "unknown_error"
    });
  }
});
