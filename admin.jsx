import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const SUPABASE_URL = "TU_SUPABASE_URL";
const SUPABASE_ANON_KEY = "TU_ANON_KEY";
const ADMIN_PASSWORD = "TU_PASSWORD";

const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 30000;
const ADMIN_SESSION_KEY = "of_admin_auth_ok";

let supabaseClient = null;

function hasSupabaseConfig() {
  return (
    typeof SUPABASE_URL === "string" &&
    /^https?:\/\//i.test(SUPABASE_URL) &&
    !SUPABASE_URL.includes("TU_SUPABASE_URL") &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_ANON_KEY.trim().length > 0 &&
    !SUPABASE_ANON_KEY.includes("TU_ANON_KEY")
  );
}

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (!hasSupabaseConfig()) return null;
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  } catch {
    return null;
  }
}

function shortId(value) {
  if (!value || typeof value !== "string") return "-";
  return value.slice(0, 8);
}

function fmtDate(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString();
}

function normalizeSource(input, row) {
  const value = String(input || "").toLowerCase().trim();
  if (row?.mgo_directo || row?.mgo_en_canal) return "mgo";
  if (!value || value === "null" || value === "undefined") return "direct";
  if (value.includes("insta")) return "instagram";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("twitter") || value === "x") return "twitter";
  if (value.includes("reddit")) return "reddit";
  if (value.includes("mgo")) return "mgo";
  if (value === "direct") return "direct";
  return value;
}

function isFlow6Conflict(row) {
  if (!row || row.of_activo) return false;
  const count = [row.telegram_activo, row.mgo_directo, row.mgo_en_canal].filter(Boolean).length;
  return count >= 2;
}

function Card({ children, className = "", style }) {
  return (
    <div className={`bg-[#111111] border border-[#1e1e1e] rounded-xl ${className}`} style={style}>
      {children}
    </div>
  );
}

function ErrorText({ text }) {
  if (!text) return null;
  return <p className="mt-2 text-sm text-red-400">{text}</p>;
}

function DataTable({ columns, rows, loading, emptyText }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[#1e1e1e] bg-[#0d0d0d]">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1e1e1e]">
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-4 text-sm text-gray-400">
                Cargando...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-4 text-sm text-gray-500">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={row.__key || idx} className={idx % 2 === 0 ? "bg-[#111111]" : "bg-[#0d0d0d]"}>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-sm text-gray-200">
                    {col.render ? col.render(row) : row[col.key] ?? "-"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function pct(num, den) {
  if (!den) return 0;
  return (num / den) * 100;
}

export default function AdminPanel() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  const [activeView, setActiveView] = useState("dashboard");
  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  const [sectionLoading, setSectionLoading] = useState({
    dashboard: false,
    source: false,
    geo: false,
    leads: false,
    flows: false,
    vip: false,
    winback: false,
    events: false,
    cupid: false
  });

  const [sectionError, setSectionError] = useState({
    dashboard: "",
    source: "",
    geo: "",
    leads: "",
    flows: "",
    vip: "",
    winback: "",
    events: "",
    cupid: ""
  });

  const [dashboard, setDashboard] = useState(null);
  const [sourceStats, setSourceStats] = useState([]);
  const [geoCountries, setGeoCountries] = useState([]);
  const [geoCities, setGeoCities] = useState([]);
  const [flowStats, setFlowStats] = useState([]);
  const [vipRows, setVipRows] = useState([]);
  const [winbackTelegramRows, setWinbackTelegramRows] = useState([]);
  const [winbackMgoRows, setWinbackMgoRows] = useState([]);
  const [eventsRows, setEventsRows] = useState([]);
  const [cupidStats, setCupidStats] = useState(null);

  const [leadsRows, setLeadsRows] = useState([]);
  const [leadsTotalCount, setLeadsTotalCount] = useState(0);
  const [leadsPage, setLeadsPage] = useState(1);

  const [filterSource, setFilterSource] = useState("all");
  const [filterTelegram, setFilterTelegram] = useState("all");
  const [filterOf, setFilterOf] = useState("all");
  const [filterMgoDirecto, setFilterMgoDirecto] = useState("all");
  const [filterMgoCanal, setFilterMgoCanal] = useState("all");
  const [filterFlow, setFilterFlow] = useState("all");
  const [filterPais, setFilterPais] = useState("all");

  const winbackCutoffIso = useMemo(() => {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    return cutoff.toISOString();
  }, []);

  const setLoading = useCallback((key, value) => {
    setSectionLoading((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setError = useCallback((key, value) => {
    setSectionError((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    setIsAuthed(window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "1");
    setAuthReady(true);
  }, []);

  const countLeads = useCallback(async (filters = {}) => {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Configura SUPABASE_URL y SUPABASE_ANON_KEY en admin.jsx");

    let query = supabase.from("leads").select("visitor_id", { count: "exact", head: true });

    if (filters.telegram !== undefined) query = query.eq("telegram_activo", !!filters.telegram);
    if (filters.of !== undefined) query = query.eq("of_activo", !!filters.of);
    if (filters.mgoDirect !== undefined) query = query.eq("mgo_directo", !!filters.mgoDirect);
    if (filters.mgoCanal !== undefined) query = query.eq("mgo_en_canal", !!filters.mgoCanal);
    if (filters.activeFlow) query = query.eq("active_flow", String(filters.activeFlow));
    if (filters.winbackSent !== undefined) query = query.eq("winback_sent", !!filters.winbackSent);
    if (filters.updatedBeforeIso) query = query.lt("updated_at", filters.updatedBeforeIso);
    if (filters.pais) query = query.eq("pais", filters.pais);

    if (filters.source) {
      if (filters.source === "mgo") {
        query = query.or("mgo_directo.is.true,mgo_en_canal.is.true");
      } else if (filters.source === "direct") {
        query = query.or("utm_source.eq.direct,utm_source.is.null");
      } else {
        query = query.eq("utm_source", filters.source);
      }
    }

    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  }, []);

  const loadDashboard = useCallback(async () => {
    setLoading("dashboard", true);
    setError("dashboard", "");

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Configura SUPABASE_URL y SUPABASE_ANON_KEY en admin.jsx");

      const [
        total,
        telegram,
        of,
        mgoDirect,
        mgoCanal,
        winbackPending,
        flow3Total,
        flow3Converted
      ] = await Promise.all([
        countLeads(),
        countLeads({ telegram: true }),
        countLeads({ of: true }),
        countLeads({ mgoDirect: true }),
        countLeads({ mgoCanal: true }),
        countLeads({ of: false, winbackSent: false, updatedBeforeIso: winbackCutoffIso }),
        countLeads({ activeFlow: "3" }),
        countLeads({ activeFlow: "3", of: true })
      ]);

      const { data: conflictData, error: conflictError } = await supabase
        .from("leads")
        .select("visitor_id,of_activo,telegram_activo,mgo_directo,mgo_en_canal")
        .eq("of_activo", false)
        .limit(5000);

      if (conflictError) throw conflictError;
      const conflicts = (conflictData || []).filter(isFlow6Conflict).length;

      setDashboard({
        total,
        telegram,
        of,
        mgoDirect,
        mgoCanal,
        conflicts,
        winbackPending,
        cupidConversionPct: pct(flow3Converted, flow3Total)
      });
    } catch (error) {
      setError("dashboard", error.message || "No se pudo cargar dashboard");
    } finally {
      setLoading("dashboard", false);
    }
  }, [countLeads, setError, setLoading, winbackCutoffIso]);

  const loadSourceStats = useCallback(async () => {
    setLoading("source", true);
    setError("source", "");

    try {
      const channels = ["instagram", "tiktok", "twitter", "reddit", "direct", "mgo"];
      const rows = await Promise.all(
        channels.map(async (source) => {
          const [total, canal, conv, mgoDirect, mgoCanal] = await Promise.all([
            countLeads({ source }),
            countLeads({ source, telegram: true }),
            countLeads({ source, of: true }),
            countLeads({ source, mgoDirect: true }),
            countLeads({ source, mgoCanal: true })
          ]);

          return {
            source,
            sourceLabel: source.toUpperCase(),
            total,
            canal,
            conv,
            mgoDirect,
            mgoCanal
          };
        })
      );

      setSourceStats(rows);
    } catch (error) {
      setError("source", error.message || "No se pudo cargar estadisticas por origen");
    } finally {
      setLoading("source", false);
    }
  }, [countLeads, setError, setLoading]);

  const loadGeoStats = useCallback(async () => {
    setLoading("geo", true);
    setError("geo", "");

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Configura SUPABASE_URL y SUPABASE_ANON_KEY en admin.jsx");

      const { data, error } = await supabase
        .from("leads")
        .select("pais,ciudad")
        .not("pais", "is", null)
        .limit(5000);

      if (error) throw error;

      const countryMap = new Map();
      const cityMap = new Map();

      for (const row of data || []) {
        const pais = row.pais || "Sin pais";
        const ciudad = row.ciudad || "Sin ciudad";
        countryMap.set(pais, (countryMap.get(pais) || 0) + 1);
        cityMap.set(`${pais} | ${ciudad}`, (cityMap.get(`${pais} | ${ciudad}`) || 0) + 1);
      }

      const countries = Array.from(countryMap.entries())
        .map(([pais, total]) => ({ pais, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);

      const cities = Array.from(cityMap.entries())
        .map(([label, total]) => {
          const [pais, ciudad] = label.split(" | ");
          return { pais, ciudad, total };
        })
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);

      setGeoCountries(countries);
      setGeoCities(cities);
    } catch (error) {
      setError("geo", error.message || "No se pudo cargar geolocalizacion");
    } finally {
      setLoading("geo", false);
    }
  }, [setError, setLoading]);

  const loadLeads = useCallback(async () => {
    setLoading("leads", true);
    setError("leads", "");

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Configura SUPABASE_URL y SUPABASE_ANON_KEY en admin.jsx");

      let query = supabase
        .from("leads")
        .select(
          "visitor_id,utm_source,idioma,dispositivo,pais,ciudad,telegram_activo,of_activo,mgo_directo,mgo_en_canal,active_flow,winback_sent,created_at,telegram_user_id,updated_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      if (filterSource !== "all") {
        if (filterSource === "mgo") query = query.or("mgo_directo.is.true,mgo_en_canal.is.true");
        else if (filterSource === "direct") query = query.or("utm_source.eq.direct,utm_source.is.null");
        else query = query.eq("utm_source", filterSource);
      }
      if (filterTelegram !== "all") query = query.eq("telegram_activo", filterTelegram === "true");
      if (filterOf !== "all") query = query.eq("of_activo", filterOf === "true");
      if (filterMgoDirecto !== "all") query = query.eq("mgo_directo", filterMgoDirecto === "true");
      if (filterMgoCanal !== "all") query = query.eq("mgo_en_canal", filterMgoCanal === "true");
      if (filterFlow !== "all") query = query.eq("active_flow", filterFlow);
      if (filterPais !== "all") query = query.eq("pais", filterPais);

      const from = (leadsPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      const rows = (data || []).map((row, idx) => ({ ...row, __key: `${row.visitor_id}-${idx}` }));
      setLeadsRows(rows);
      setLeadsTotalCount(count || 0);
    } catch (error) {
      setError("leads", error.message || "No se pudo cargar leads");
    } finally {
      setLoading("leads", false);
    }
  }, [
    filterFlow,
    filterMgoCanal,
    filterMgoDirecto,
    filterOf,
    filterPais,
    filterSource,
    filterTelegram,
    leadsPage,
    setError,
    setLoading
  ]);

  const loadFlowStats = useCallback(async () => {
    setLoading("flows", true);
    setError("flows", "");

    try {
      const total = await countLeads();
      const [f1, f2, f3, f4, f5, f6] = await Promise.all([
        countLeads({ activeFlow: "1" }),
        countLeads({ activeFlow: "2" }),
        countLeads({ activeFlow: "3" }),
        countLeads({ activeFlow: "4" }),
        countLeads({ activeFlow: "5" }),
        countLeads({ activeFlow: "6" })
      ]);

      setFlowStats([
        { flow: "1", nombre: "MGO Directo", desc: "DM directo desde MGO", total: f1, pct: pct(f1, total) },
        { flow: "2", nombre: "MGO en Canal", desc: "MGO al canal sin DM", total: f2, pct: pct(f2, total) },
        { flow: "3", nombre: "Social a Canal", desc: "Redes al canal, seduccion CupidBot", total: f3, pct: pct(f3, total) },
        { flow: "4", nombre: "VIP OF", desc: "OF activo, bots apagados", total: f4, pct: pct(f4, total) },
        { flow: "5", nombre: "Winback MGO", desc: "MGO inactivo 14 dias", total: f5, pct: pct(f5, total) },
        { flow: "6", nombre: "Conflicto", desc: "Tracking conflictivo", total: f6, pct: pct(f6, total) }
      ]);
    } catch (error) {
      setError("flows", error.message || "No se pudo cargar flujos");
    } finally {
      setLoading("flows", false);
    }
  }, [countLeads, setError, setLoading]);

  const loadVip = useCallback(async () => {
    setLoading("vip", true);
    setError("vip", "");

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Configura SUPABASE_URL y SUPABASE_ANON_KEY en admin.jsx");

      const { data, error } = await supabase
        .from("leads")
        .select("visitor_id,utm_source,pais,telegram_user_id,created_at,updated_at")
        .eq("of_activo", true)
        .order("updated_at", { ascending: false })
        .limit(300);

      if (error) throw error;
      setVipRows((data || []).map((row, idx) => ({ ...row, __key: `${row.visitor_id}-${idx}` })));
    } catch (error) {
      setError("vip", error.message || "No se pudo cargar VIP");
    } finally {
      setLoading("vip", false);
    }
  }, [setError, setLoading]);

  const loadWinback = useCallback(async () => {
    setLoading("winback", true);
    setError("winback", "");

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Configura SUPABASE_URL y SUPABASE_ANON_KEY en admin.jsx");

      const [social, mgo] = await Promise.all([
        supabase
          .from("leads")
          .select("visitor_id,utm_source,pais,updated_at,active_flow,mgo_directo,mgo_en_canal")
          .eq("telegram_activo", true)
          .eq("of_activo", false)
          .eq("mgo_directo", false)
          .eq("mgo_en_canal", false)
          .eq("winback_sent", false)
          .lt("updated_at", winbackCutoffIso)
          .order("updated_at", { ascending: true })
          .limit(300),
        supabase
          .from("leads")
          .select("visitor_id,utm_source,pais,updated_at,active_flow,mgo_directo,mgo_en_canal")
          .eq("of_activo", false)
          .eq("winback_sent", false)
          .lt("updated_at", winbackCutoffIso)
          .or("mgo_directo.is.true,mgo_en_canal.is.true")
          .order("updated_at", { ascending: true })
          .limit(300)
      ]);

      if (social.error) throw social.error;
      if (mgo.error) throw mgo.error;

      const now = Date.now();
      const mapRows = (rows) =>
        (rows || []).map((row, idx) => {
          const updatedMs = row?.updated_at ? new Date(row.updated_at).getTime() : now;
          const diasInactivo = Math.max(0, Math.floor((now - updatedMs) / (24 * 60 * 60 * 1000)));
          return { ...row, diasInactivo, __key: `${row.visitor_id}-${idx}` };
        });

      setWinbackTelegramRows(mapRows(social.data));
      setWinbackMgoRows(mapRows(mgo.data));
    } catch (error) {
      setError("winback", error.message || "No se pudo cargar winback");
    } finally {
      setLoading("winback", false);
    }
  }, [setError, setLoading, winbackCutoffIso]);

  const loadEvents = useCallback(async () => {
    setLoading("events", true);
    setError("events", "");

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Configura SUPABASE_URL y SUPABASE_ANON_KEY en admin.jsx");

      const { data: eventsData, error: eventsError } = await supabase
        .from("eventos")
        .select("created_at,visitor_id,boton_clickado,utm_source,idioma,dispositivo")
        .order("created_at", { ascending: false })
        .limit(50);

      if (eventsError) throw eventsError;

      const visitorIds = [...new Set((eventsData || []).map((e) => e.visitor_id).filter(Boolean))];
      let paisMap = new Map();

      if (visitorIds.length > 0) {
        const { data: leadGeoData } = await supabase
          .from("leads")
          .select("visitor_id,pais")
          .in("visitor_id", visitorIds);
        paisMap = new Map((leadGeoData || []).map((r) => [r.visitor_id, r.pais || "-"]));
      }

      const rows = (eventsData || []).map((row, idx) => ({
        ...row,
        pais: paisMap.get(row.visitor_id) || "-",
        __key: `${row.created_at}-${row.visitor_id}-${idx}`
      }));

      setEventsRows(rows);
    } catch (error) {
      setError("events", error.message || "No se pudo cargar eventos");
    } finally {
      setLoading("events", false);
    }
  }, [setError, setLoading]);

  const loadCupid = useCallback(async () => {
    setLoading("cupid", true);
    setError("cupid", "");

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Configura SUPABASE_URL y SUPABASE_ANON_KEY en admin.jsx");

      const { data, error } = await supabase
        .from("leads")
        .select("visitor_id,active_flow,of_activo,last_bot_action,updated_at")
        .eq("active_flow", "3")
        .limit(5000);

      if (error) throw error;

      const totalCupid = (data || []).length;
      const converted = (data || []).filter((r) => r.of_activo).length;

      const deltas = (data || [])
        .filter((r) => r.of_activo && r.last_bot_action && r.updated_at)
        .map((r) => {
          const start = new Date(r.last_bot_action).getTime();
          const end = new Date(r.updated_at).getTime();
          if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
          return (end - start) / (1000 * 60 * 60);
        })
        .filter((h) => h !== null);

      const avgHours = deltas.length > 0 ? deltas.reduce((sum, h) => sum + h, 0) / deltas.length : 0;

      setCupidStats({
        totalCupid,
        converted,
        conversionPct: pct(converted, totalCupid),
        avgHours
      });
    } catch (error) {
      setError("cupid", error.message || "No se pudo cargar rendimiento CupidBot");
    } finally {
      setLoading("cupid", false);
    }
  }, [setError, setLoading]);

  const refreshAll = useCallback(async () => {
    if (!isAuthed) return;

    await Promise.all([
      loadDashboard(),
      loadSourceStats(),
      loadGeoStats(),
      loadLeads(),
      loadFlowStats(),
      loadVip(),
      loadWinback(),
      loadEvents(),
      loadCupid()
    ]);

    setLastRefreshAt(new Date());
  }, [
    isAuthed,
    loadCupid,
    loadDashboard,
    loadEvents,
    loadFlowStats,
    loadGeoStats,
    loadLeads,
    loadSourceStats,
    loadVip,
    loadWinback
  ]);

  useEffect(() => {
    if (!isAuthed) return;
    refreshAll();
  }, [isAuthed, refreshAll]);

  useEffect(() => {
    if (!isAuthed) return;
    const timer = window.setInterval(refreshAll, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isAuthed, refreshAll]);

  useEffect(() => {
    if (!isAuthed) return;
    const supabase = getSupabase();
    if (!supabase) return;

    let timeoutId = null;
    const scheduleRefresh = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => refreshAll(), 500);
    };

    const leadsChannel = supabase.channel("admin-live-leads").on("postgres_changes", { event: "*", schema: "public", table: "leads" }, scheduleRefresh).subscribe();
    const eventsChannel = supabase.channel("admin-live-events").on("postgres_changes", { event: "*", schema: "public", table: "eventos" }, scheduleRefresh).subscribe();

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, [isAuthed, refreshAll]);

  useEffect(() => {
    if (!isAuthed) return;
    loadLeads();
  }, [isAuthed, leadsPage, filterSource, filterTelegram, filterOf, filterMgoDirecto, filterMgoCanal, filterFlow, filterPais, loadLeads]);

  const totalLeadPages = Math.max(1, Math.ceil(leadsTotalCount / PAGE_SIZE));

  const login = (event) => {
    event.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      setAuthError("");
      setIsAuthed(true);
      return;
    }
    setAuthError("Password incorrecta");
  };

  const logout = () => {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setPasswordInput("");
    setIsAuthed(false);
  };

  const navItems = [
    ["dashboard", "Dashboard"],
    ["source", "Origen"],
    ["geo", "Geo"],
    ["leads", "Leads"],
    ["flows", "Flujos"],
    ["vip", "VIP"],
    ["winback", "Winback"],
    ["events", "Eventos"],
    ["cupid", "CupidBot"]
  ];

  const leadsColumns = [
    { key: "visitor_id", label: "ID", render: (r) => <span className="font-mono text-blue-300">{shortId(r.visitor_id)}</span> },
    { key: "utm_source", label: "Origen", render: (r) => normalizeSource(r.utm_source, r) },
    { key: "idioma", label: "Idioma", render: (r) => r.idioma || "-" },
    { key: "dispositivo", label: "Dispositivo", render: (r) => r.dispositivo || "-" },
    { key: "pais", label: "Pais", render: (r) => r.pais || "-" },
    { key: "ciudad", label: "Ciudad", render: (r) => r.ciudad || "-" },
    { key: "telegram_activo", label: "Telegram", render: (r) => (r.telegram_activo ? "true" : "false") },
    { key: "of_activo", label: "OF", render: (r) => (r.of_activo ? "true" : "false") },
    { key: "mgo_directo", label: "MGO DM", render: (r) => (r.mgo_directo ? "true" : "false") },
    { key: "mgo_en_canal", label: "MGO Canal", render: (r) => (r.mgo_en_canal ? "true" : "false") },
    { key: "active_flow", label: "Flow", render: (r) => r.active_flow || "-" },
    { key: "winback_sent", label: "Winback", render: (r) => (r.winback_sent ? "true" : "false") },
    { key: "created_at", label: "Alta", render: (r) => fmtDate(r.created_at) }
  ];

  const vipColumns = [
    { key: "visitor_id", label: "ID", render: (r) => <span className="font-mono text-blue-300">{shortId(r.visitor_id)}</span> },
    { key: "utm_source", label: "Origen", render: (r) => normalizeSource(r.utm_source, r) },
    { key: "pais", label: "Pais", render: (r) => r.pais || "-" },
    { key: "telegram_user_id", label: "Telegram ID", render: (r) => r.telegram_user_id || "-" },
    { key: "created_at", label: "Creado", render: (r) => fmtDate(r.created_at) },
    { key: "updated_at", label: "Actualizado", render: (r) => fmtDate(r.updated_at) }
  ];

  const winbackColumns = [
    { key: "visitor_id", label: "ID", render: (r) => <span className="font-mono text-blue-300">{shortId(r.visitor_id)}</span> },
    { key: "utm_source", label: "Origen", render: (r) => normalizeSource(r.utm_source, r) },
    { key: "pais", label: "Pais", render: (r) => r.pais || "-" },
    { key: "diasInactivo", label: "Dias", render: (r) => r.diasInactivo },
    { key: "active_flow", label: "Flow", render: (r) => r.active_flow || "-" }
  ];

  const eventColumns = [
    { key: "created_at", label: "Timestamp", render: (r) => fmtDate(r.created_at) },
    { key: "visitor_id", label: "ID", render: (r) => <span className="font-mono text-blue-300">{shortId(r.visitor_id)}</span> },
    { key: "boton_clickado", label: "Boton", render: (r) => r.boton_clickado || "-" },
    { key: "utm_source", label: "Origen", render: (r) => normalizeSource(r.utm_source, r) },
    { key: "pais", label: "Pais", render: (r) => r.pais || "-" },
    { key: "idioma", label: "Idioma", render: (r) => r.idioma || "-" },
    { key: "dispositivo", label: "Dispositivo", render: (r) => r.dispositivo || "-" }
  ];

  if (!authReady) {
    return <div className="min-h-screen grid place-items-center bg-[#080808] text-gray-100">Cargando...</div>;
  }

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#080808] text-gray-100 p-6 flex items-center justify-center">
        <main className="w-full max-w-md">
          <Card className="p-8">
            <h1 className="text-xl font-bold text-center">Admin OFM</h1>
            <p className="text-sm text-gray-400 text-center mt-1">Acceso interno</p>
            <form className="mt-6 space-y-4" onSubmit={login}>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Password"
                className="w-full bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-4 py-3"
              />
              {authError ? <p className="text-red-400 text-sm">{authError}</p> : null}
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 rounded-lg py-3 font-semibold">
                Entrar
              </button>
            </form>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-gray-100">
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-[210px] bg-[#0d0d0d] border-r border-[#1e1e1e] flex-col">
        <div className="p-6 border-b border-[#1e1e1e]">
          <h2 className="text-lg font-bold text-blue-400">OFM Control</h2>
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Visual Admin</p>
        </div>
        <nav className="p-2 flex-1 space-y-1 overflow-y-auto">
          {navItems.map(([id, label]) => {
            const active = activeView === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveView(id)}
                className={`w-full text-left px-4 py-2 rounded-lg text-sm ${active ? "bg-blue-500/15 text-blue-300" : "text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]"}`}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="ml-0 md:ml-[210px] min-h-screen pb-24 md:pb-8">
        <header className="sticky top-0 z-20 h-16 border-b border-[#1e1e1e] bg-[#080808]/95 backdrop-blur px-6 flex items-center justify-between">
          <div>
            <h1 className="font-bold">Panel Operativo</h1>
            <p className="text-xs text-gray-500">{lastRefreshAt ? `Actualizado ${lastRefreshAt.toLocaleTimeString()}` : "Sin refresco"}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={refreshAll} className="px-3 py-2 rounded-lg border border-[#1e1e1e] bg-[#111111] text-sm">
              Refresh
            </button>
            <button type="button" onClick={logout} className="px-3 py-2 rounded-lg border border-[#1e1e1e] bg-[#111111] text-sm text-red-300">
              Salir
            </button>
          </div>
        </header>

        <section className="p-6 md:p-8 max-w-[1460px] mx-auto space-y-6">
          {!hasSupabaseConfig() ? (
            <Card className="p-4 border-amber-500/40 bg-amber-500/10 text-amber-300">
              Configuracion pendiente: define SUPABASE_URL y SUPABASE_ANON_KEY al inicio de admin.jsx.
            </Card>
          ) : null}

          {activeView === "dashboard" ? (
            <>
              <ErrorText text={sectionError.dashboard} />
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">Total Leads</p><p className="text-3xl font-extrabold mt-2">{sectionLoading.dashboard ? "..." : dashboard?.total ?? "-"}</p></Card>
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">Telegram activo</p><p className="text-3xl font-extrabold mt-2">{sectionLoading.dashboard ? "..." : `${(dashboard?.total ? pct(dashboard.telegram, dashboard.total) : 0).toFixed(1)}%`}</p></Card>
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">OF activo</p><p className="text-3xl font-extrabold mt-2">{sectionLoading.dashboard ? "..." : `${(dashboard?.total ? pct(dashboard.of, dashboard.total) : 0).toFixed(1)}%`}</p></Card>
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">Conflictos (Flujo 6)</p><p className="text-3xl font-extrabold mt-2 text-red-300">{sectionLoading.dashboard ? "..." : dashboard?.conflicts ?? "-"}</p></Card>
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">MGO Directo</p><p className="text-3xl font-extrabold mt-2">{sectionLoading.dashboard ? "..." : `${(dashboard?.total ? pct(dashboard.mgoDirect, dashboard.total) : 0).toFixed(1)}%`}</p></Card>
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">MGO en Canal</p><p className="text-3xl font-extrabold mt-2">{sectionLoading.dashboard ? "..." : `${(dashboard?.total ? pct(dashboard.mgoCanal, dashboard.total) : 0).toFixed(1)}%`}</p></Card>
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">Winback pendiente</p><p className="text-3xl font-extrabold mt-2">{sectionLoading.dashboard ? "..." : dashboard?.winbackPending ?? "-"}</p></Card>
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">CupidBot → OF</p><p className="text-3xl font-extrabold mt-2 text-emerald-300">{sectionLoading.dashboard ? "..." : `${(dashboard?.cupidConversionPct || 0).toFixed(1)}%`}</p></Card>
              </div>
            </>
          ) : null}

          {activeView === "source" ? (
            <>
              <ErrorText text={sectionError.source} />
              <Card className="p-5">
                {sectionLoading.source ? (
                  <p className="text-gray-400">Cargando...</p>
                ) : (
                  <div className="h-[320px]">
                    <ResponsiveContainer>
                      <BarChart data={sourceStats}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="sourceLabel" stroke="#9ca3af" />
                        <YAxis stroke="#9ca3af" />
                        <Tooltip contentStyle={{ background: "#111111", border: "1px solid #1e1e1e" }} />
                        <Legend />
                        <Bar dataKey="total" name="Total" fill="#334155" />
                        <Bar dataKey="canal" name="Canal" fill="#3b82f6" />
                        <Bar dataKey="conv" name="OF" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
              <Card>
                <DataTable
                  columns={[
                    { key: "sourceLabel", label: "Origen" },
                    { key: "total", label: "Total" },
                    { key: "canal", label: "Entraron Canal" },
                    { key: "conv", label: "Convirtieron OF" },
                    { key: "mgoDirect", label: "MGO Directo" },
                    { key: "mgoCanal", label: "MGO en Canal" }
                  ]}
                  rows={sourceStats.map((r, i) => ({ ...r, __key: `${r.source}-${i}` }))}
                  loading={sectionLoading.source}
                  emptyText="Sin datos"
                />
              </Card>
            </>
          ) : null}

          {activeView === "geo" ? (
            <>
              <ErrorText text={sectionError.geo} />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card>
                  <div className="px-5 py-4 border-b border-[#1e1e1e] text-sm font-semibold">Top Paises</div>
                  <DataTable columns={[{ key: "pais", label: "Pais" }, { key: "total", label: "Leads" }]} rows={geoCountries.map((r, i) => ({ ...r, __key: `c-${i}` }))} loading={sectionLoading.geo} emptyText="Sin paises" />
                </Card>
                <Card>
                  <div className="px-5 py-4 border-b border-[#1e1e1e] text-sm font-semibold">Top Ciudades</div>
                  <DataTable columns={[{ key: "pais", label: "Pais" }, { key: "ciudad", label: "Ciudad" }, { key: "total", label: "Leads" }]} rows={geoCities.map((r, i) => ({ ...r, __key: `ct-${i}` }))} loading={sectionLoading.geo} emptyText="Sin ciudades" />
                </Card>
              </div>
            </>
          ) : null}

          {activeView === "leads" ? (
            <>
              <ErrorText text={sectionError.leads} />
              <Card className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <select value={filterSource} onChange={(e) => { setLeadsPage(1); setFilterSource(e.target.value); }} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-3 py-2">
                    <option value="all">Origen: todos</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="twitter">Twitter</option><option value="reddit">Reddit</option><option value="direct">Direct</option><option value="mgo">MGO</option>
                  </select>
                  <select value={filterTelegram} onChange={(e) => { setLeadsPage(1); setFilterTelegram(e.target.value); }} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-3 py-2">
                    <option value="all">Telegram: todos</option><option value="true">Telegram true</option><option value="false">Telegram false</option>
                  </select>
                  <select value={filterOf} onChange={(e) => { setLeadsPage(1); setFilterOf(e.target.value); }} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-3 py-2">
                    <option value="all">OF: todos</option><option value="true">OF true</option><option value="false">OF false</option>
                  </select>
                  <select value={filterMgoDirecto} onChange={(e) => { setLeadsPage(1); setFilterMgoDirecto(e.target.value); }} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-3 py-2">
                    <option value="all">MGO directo: todos</option><option value="true">MGO directo true</option><option value="false">MGO directo false</option>
                  </select>
                  <select value={filterMgoCanal} onChange={(e) => { setLeadsPage(1); setFilterMgoCanal(e.target.value); }} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-3 py-2">
                    <option value="all">MGO canal: todos</option><option value="true">MGO canal true</option><option value="false">MGO canal false</option>
                  </select>
                  <select value={filterFlow} onChange={(e) => { setLeadsPage(1); setFilterFlow(e.target.value); }} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-3 py-2">
                    <option value="all">Flow: todos</option><option value="1">Flow 1</option><option value="2">Flow 2</option><option value="3">Flow 3</option><option value="4">Flow 4</option><option value="5">Flow 5</option><option value="6">Flow 6</option>
                  </select>
                  <select value={filterPais} onChange={(e) => { setLeadsPage(1); setFilterPais(e.target.value); }} className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-3 py-2">
                    <option value="all">Pais: todos</option>
                    {geoCountries.map((r) => (<option key={r.pais} value={r.pais}>{r.pais}</option>))}
                  </select>
                  <button type="button" onClick={loadLeads} className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 font-semibold">Aplicar</button>
                </div>
              </Card>
              <Card>
                <DataTable columns={leadsColumns} rows={leadsRows} loading={sectionLoading.leads} emptyText="Sin leads" />
                <div className="px-5 py-4 border-t border-[#1e1e1e] flex items-center justify-between text-xs text-gray-500">
                  <span>Pagina {leadsPage} de {totalLeadPages} · Total {leadsTotalCount}</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={leadsPage <= 1} onClick={() => setLeadsPage((p) => Math.max(1, p - 1))} className="px-3 py-1 rounded border border-[#1e1e1e] disabled:opacity-40">Prev</button>
                    <button type="button" disabled={leadsPage >= totalLeadPages} onClick={() => setLeadsPage((p) => Math.min(totalLeadPages, p + 1))} className="px-3 py-1 rounded border border-[#1e1e1e] disabled:opacity-40">Next</button>
                  </div>
                </div>
              </Card>
            </>
          ) : null}

          {activeView === "flows" ? (
            <>
              <ErrorText text={sectionError.flows} />
              <Card>
                <DataTable
                  columns={[
                    { key: "flow", label: "Flow" },
                    { key: "nombre", label: "Nombre" },
                    { key: "desc", label: "Descripcion" },
                    { key: "total", label: "Leads" },
                    { key: "pct", label: "% Total", render: (r) => `${r.pct.toFixed(1)}%` }
                  ]}
                  rows={flowStats.map((r, i) => ({ ...r, __key: `${r.flow}-${i}` }))}
                  loading={sectionLoading.flows}
                  emptyText="Sin flujos"
                />
              </Card>
            </>
          ) : null}

          {activeView === "vip" ? (
            <>
              <ErrorText text={sectionError.vip} />
              <Card>
                <div className="px-5 py-4 border-b border-[#1e1e1e] text-sm font-semibold">VIP (OF=true) - solo monitoreo</div>
                <DataTable columns={vipColumns} rows={vipRows} loading={sectionLoading.vip} emptyText="Sin VIP" />
              </Card>
            </>
          ) : null}

          {activeView === "winback" ? (
            <>
              <ErrorText text={sectionError.winback} />
              <Card>
                <div className="px-5 py-4 border-b border-[#1e1e1e] text-sm font-semibold">Winback Telegram (Flujo 3)</div>
                <DataTable columns={winbackColumns} rows={winbackTelegramRows} loading={sectionLoading.winback} emptyText="Sin pendientes" />
              </Card>
              <Card>
                <div className="px-5 py-4 border-b border-[#1e1e1e] text-sm font-semibold">Winback MGO (Flujo 5)</div>
                <DataTable columns={winbackColumns} rows={winbackMgoRows} loading={sectionLoading.winback} emptyText="Sin pendientes" />
              </Card>
            </>
          ) : null}

          {activeView === "events" ? (
            <>
              <ErrorText text={sectionError.events} />
              <Card>
                <div className="px-5 py-4 border-b border-[#1e1e1e] text-sm font-semibold">Eventos recientes (50)</div>
                <DataTable columns={eventColumns} rows={eventsRows} loading={sectionLoading.events} emptyText="Sin eventos" />
              </Card>
            </>
          ) : null}

          {activeView === "cupid" ? (
            <>
              <ErrorText text={sectionError.cupid} />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">Leads atendidos por CupidBot</p><p className="text-3xl font-extrabold mt-2">{sectionLoading.cupid ? "..." : cupidStats?.totalCupid ?? 0}</p></Card>
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">Convirtieron a OF</p><p className="text-3xl font-extrabold mt-2">{sectionLoading.cupid ? "..." : cupidStats?.converted ?? 0}</p></Card>
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">Tasa CupidBot → OF</p><p className="text-3xl font-extrabold mt-2 text-emerald-300">{sectionLoading.cupid ? "..." : `${(cupidStats?.conversionPct || 0).toFixed(1)}%`}</p></Card>
                <Card className="p-5"><p className="text-xs text-gray-500 uppercase">Tiempo medio conversion</p><p className="text-3xl font-extrabold mt-2">{sectionLoading.cupid ? "..." : `${(cupidStats?.avgHours || 0).toFixed(1)}h`}</p></Card>
              </div>
            </>
          ) : null}
        </section>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-[#0d0d0d]/95 backdrop-blur border-t border-[#1e1e1e] px-3 py-2 flex gap-2 overflow-x-auto">
        {navItems.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveView(id)}
            className={`px-3 py-2 rounded-lg text-xs whitespace-nowrap ${activeView === id ? "bg-blue-500/20 text-blue-300" : "text-gray-500"}`}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
