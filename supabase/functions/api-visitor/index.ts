// @ts-nocheck

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getRequiredEnv,
  handleOptions,
  jsonResponse,
  validateHmacRequest
} from "../_shared/security.ts";

type LeadsLookupRow = {
  visitor_id: string;
};

Deno.serve(async (req: Request) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) {
    return optionsResponse;
  }

  if (req.method !== "GET") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const url = new URL(req.url);
    const fingerprint = url.searchParams.get("fingerprint")?.trim();

    if (!fingerprint) {
      return jsonResponse(400, { ok: false, error: "missing_fingerprint" });
    }

    const hmacSecret = getRequiredEnv("EDGE_HMAC_SECRET");
    const canonical = `GET\n/api/visitor\n${req.headers.get("x-timestamp") ?? ""}\n${fingerprint}`;

    const hmacResult = await validateHmacRequest({
      req,
      canonicalPayload: canonical,
      secret: hmacSecret,
      maxAgeSeconds: 300
    });

    if (!hmacResult.ok) {
      return hmacResult.response;
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data, error } = await supabase
      .from("leads")
      .select("visitor_id")
      .eq("fingerprint_hash", fingerprint)
      .order("created_at", { ascending: true })
      .limit(1)
      .returns<LeadsLookupRow[]>();

    if (error) {
      return jsonResponse(500, { ok: false, error: "lookup_failed", details: error.message });
    }

    return jsonResponse(200, {
      visitor_id: data && data.length > 0 ? data[0].visitor_id : null
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      error: "internal_error",
      details: error instanceof Error ? error.message : "unknown_error"
    });
  }
});
