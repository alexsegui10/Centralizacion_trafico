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
const SOCIAL_ORDER = ["instagram", "tiktok", "twitter", "reddit", "direct"];

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

function normalizeSource(input) {
  const value = (input || "").toLowerCase().trim();
  if (!value || value === "null" || value === "undefined") return "direct";
  if (value.includes("insta")) return "instagram";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("twitter") || value === "x") return "twitter";
  if (value.includes("reddit")) return "reddit";
  if (value === "direct") return "direct";
  return value;
}

async function countLeads(filters = {}) {
  let query = supabase.from("leads").select("visitor_id", { count: "exact", head: true });

  if (filters.source) {
    const source = normalizeSource(filters.source);
    if (source === "direct") {
      query = query.or("utm_source.eq.direct,utm_source.is.null");
    } else {
      query = query.eq("utm_source", source);
    }
  }

  if (typeof filters.telegram === "boolean") query = query.eq("telegram_activo", filters.telegram);
  if (typeof filters.of === "boolean") query = query.eq("of_activo", filters.of);
  if (typeof filters.winbackSent === "boolean") query = query.eq("winback_sent", filters.winbackSent);
  if (filters.updatedBeforeIso) query = query.lt("updated_at", filters.updatedBeforeIso);

  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

function ErrorText({ text }) {
  if (!text) return null;
  return <p className="mt-2 text-sm text-red-400">{text}</p>;
}

function DataTable({ columns, rows, loading, emptyText }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
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

export default function AdminPanel() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  const [activeView, setActiveView] = useState("dashboard");

  const [metrics, setMetrics] = useState(null);
  const [socialStats, setSocialStats] = useState([]);
  const [leadsRows, setLeadsRows] = useState([]);
  const [vipRows, setVipRows] = useState([]);
  const [winbackRows, setWinbackRows] = useState([]);
  const [eventsRows, setEventsRows] = useState([]);

  const [sectionLoading, setSectionLoading] = useState({
    metrics: false,
    social: false,
    leads: false,
    vip: false,
    winback: false,
    events: false
  });

  const [sectionError, setSectionError] = useState({
    metrics: "",
    social: "",
    leads: "",
    vip: "",
    winback: "",
    events: ""
  });

  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  const [leadsPage, setLeadsPage] = useState(1);
  const [leadsTotalCount, setLeadsTotalCount] = useState(0);
  const [filterSource, setFilterSource] = useState("all");
  const [filterTelegram, setFilterTelegram] = useState("all");
  const [filterOf, setFilterOf] = useState("all");

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
    const existing = window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
    setIsAuthed(existing);
    setAuthReady(true);
  }, []);

  const loadMetrics = useCallback(async () => {
    setLoading("metrics", true);
    setError("metrics", "");

    try {
      const [total, telegram, of, winbackPending] = await Promise.all([
        countLeads(),
        countLeads({ telegram: true }),
        countLeads({ of: true }),
        countLeads({ telegram: true, of: false, winbackSent: false, updatedBeforeIso: winbackCutoffIso })
      ]);

      setMetrics({
        total,
        telegram,
        of,
        winbackPending,
        telegramPct: total > 0 ? (telegram / total) * 100 : 0,
        ofPct: total > 0 ? (of / total) * 100 : 0
      });
    } catch (error) {
      setError("metrics", error.message || "No se pudieron cargar métricas");
    } finally {
      setLoading("metrics", false);
    }
  }, [setError, setLoading, winbackCutoffIso]);

  const loadSocialStats = useCallback(async () => {
    setLoading("social", true);
    setError("social", "");

    try {
      const rows = await Promise.all(
        SOCIAL_ORDER.map(async (source) => {
          const [total, telegram, of] = await Promise.all([
            countLeads({ source }),
            countLeads({ source, telegram: true }),
            countLeads({ source, of: true })
          ]);

          return {
            source,
            sourceLabel: source.charAt(0).toUpperCase() + source.slice(1),
            total,
            telegram,
            of
          };
        })
      );

      setSocialStats(rows);
    } catch (error) {
      setError("social", error.message || "No se pudieron cargar estadísticas por red");
    } finally {
      setLoading("social", false);
    }
  }, [setError, setLoading]);

  const loadLeads = useCallback(async () => {
    setLoading("leads", true);
    setError("leads", "");

    try {
      let query = supabase
        .from("leads")
        .select(
          "visitor_id,utm_source,idioma,dispositivo,telegram_activo,of_activo,active_flow,winback_sent,created_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      if (filterSource !== "all") {
        if (filterSource === "direct") query = query.or("utm_source.eq.direct,utm_source.is.null");
        else query = query.eq("utm_source", filterSource);
      }

      if (filterTelegram !== "all") query = query.eq("telegram_activo", filterTelegram === "true");
      if (filterOf !== "all") query = query.eq("of_activo", filterOf === "true");

      const from = (leadsPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      const normalized = (Array.isArray(data) ? data : []).map((row, idx) => ({ ...row, __key: `${row.visitor_id}-${idx}` }));
      setLeadsRows(normalized);
      setLeadsTotalCount(count || 0);
    } catch (error) {
      setError("leads", error.message || "No se pudo cargar leads");
    } finally {
      setLoading("leads", false);
    }
  }, [filterOf, filterSource, filterTelegram, leadsPage, setError, setLoading]);

  const loadVip = useCallback(async () => {
    setLoading("vip", true);
    setError("vip", "");

    try {
      const { data, error } = await supabase
        .from("leads")
        .select("visitor_id,utm_source,telegram_user_id,created_at,updated_at")
        .eq("of_activo", true)
        .order("updated_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      const normalized = (Array.isArray(data) ? data : []).map((row, idx) => ({ ...row, __key: `${row.visitor_id}-${idx}` }));
      setVipRows(normalized);
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
      const { data, error } = await supabase
        .from("leads")
        .select("visitor_id,utm_source,telegram_user_id,updated_at,active_flow")
        .eq("telegram_activo", true)
        .eq("of_activo", false)
        .eq("winback_sent", false)
        .lt("updated_at", winbackCutoffIso)
        .order("updated_at", { ascending: true })
        .limit(200);

      if (error) throw error;

      const now = Date.now();
      const normalized = (Array.isArray(data) ? data : []).map((row, idx) => {
        const updatedMs = row?.updated_at ? new Date(row.updated_at).getTime() : now;
        const inactiveDays = Math.max(0, Math.floor((now - updatedMs) / (24 * 60 * 60 * 1000)));
        return { ...row, inactiveDays, __key: `${row.visitor_id}-${idx}` };
      });

      setWinbackRows(normalized);
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
      const { data, error } = await supabase
        .from("eventos")
        .select("created_at,visitor_id,boton_clickado,utm_source,idioma,dispositivo")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      const normalized = (Array.isArray(data) ? data : []).map((row, idx) => ({ ...row, __key: `${row.created_at}-${row.visitor_id}-${idx}` }));
      setEventsRows(normalized);
    } catch (error) {
      setError("events", error.message || "No se pudieron cargar eventos");
    } finally {
      setLoading("events", false);
    }
  }, [setError, setLoading]);

  const refreshAll = useCallback(async () => {
    if (!isAuthed) return;

    await Promise.all([loadMetrics(), loadSocialStats(), loadLeads(), loadVip(), loadWinback(), loadEvents()]);
    setLastRefreshAt(new Date());
  }, [isAuthed, loadEvents, loadLeads, loadMetrics, loadSocialStats, loadVip, loadWinback]);

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

    let timeoutId = null;
    const scheduleRefresh = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => refreshAll(), 500);
    };

    const leadsChannel = supabase
      .channel("admin-leads-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, scheduleRefresh)
      .subscribe();

    const eventsChannel = supabase
      .channel("admin-eventos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "eventos" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, [isAuthed, refreshAll]);

  useEffect(() => {
    if (!isAuthed) return;
    loadLeads();
  }, [isAuthed, leadsPage, filterSource, filterTelegram, filterOf, loadLeads]);

  const totalLeadPages = Math.max(1, Math.ceil(leadsTotalCount / PAGE_SIZE));

  const login = (event) => {
    event.preventDefault();

    if (passwordInput === ADMIN_PASSWORD) {
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      setAuthError("");
      setIsAuthed(true);
      return;
    }

    setAuthError("Contraseña incorrecta");
  };

  const logout = () => {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setIsAuthed(false);
    setPasswordInput("");
  };

  if (!authReady) {
    return <div className="min-h-screen grid place-items-center bg-[#080808] text-gray-200">Cargando...</div>;
  }

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-[#080808] text-gray-200 p-6 flex items-center justify-center">
        <main className="w-full max-w-md">
          <div className="bg-[#111111] border border-[#1e1e1e] p-10 rounded-xl shadow-2xl">
            <div className="flex flex-col items-center mb-10">
              <h1 className="text-xl font-bold tracking-tight">Admin Panel</h1>
              <p className="text-gray-400 text-sm mt-1">OF Agency Architecture</p>
            </div>

            <form onSubmit={login} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-gray-400 text-[11px] uppercase tracking-wider font-semibold">Password</label>
                <input
                  className="w-full bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg px-4 py-3 text-gray-100 placeholder:text-gray-500"
                  type="password"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  placeholder="••••••••••••"
                />
              </div>

              {authError ? <p className="text-red-400 text-sm">{authError}</p> : null}

              <button type="submit" className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold py-3 rounded-lg transition-colors">
                Entrar
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  const leadsColumns = [
    { key: "visitor_id", label: "ID", render: (row) => <span className="font-mono text-blue-300">{shortId(row.visitor_id)}</span> },
    { key: "utm_source", label: "Origen", render: (row) => normalizeSource(row.utm_source) },
    { key: "idioma", label: "Idioma" },
    { key: "dispositivo", label: "Dispositivo" },
    { key: "telegram_activo", label: "Telegram", render: (row) => (row.telegram_activo ? "true" : "false") },
    { key: "of_activo", label: "OF", render: (row) => (row.of_activo ? "true" : "false") },
    { key: "active_flow", label: "Flujo", render: (row) => row.active_flow || "-" },
    { key: "winback_sent", label: "Winback", render: (row) => (row.winback_sent ? "true" : "false") },
    { key: "created_at", label: "Fecha", render: (row) => fmtDate(row.created_at) }
  ];

  const vipColumns = [
    { key: "visitor_id", label: "ID", render: (row) => <span className="font-mono text-blue-300">{shortId(row.visitor_id)}</span> },
    { key: "utm_source", label: "Origen", render: (row) => normalizeSource(row.utm_source) },
    { key: "telegram_user_id", label: "Telegram ID", render: (row) => row.telegram_user_id || "-" },
    { key: "created_at", label: "Creado", render: (row) => fmtDate(row.created_at) },
    { key: "updated_at", label: "Actualizado", render: (row) => fmtDate(row.updated_at) }
  ];

  const winbackColumns = [
    { key: "visitor_id", label: "ID", render: (row) => <span className="font-mono text-blue-300">{shortId(row.visitor_id)}</span> },
    { key: "utm_source", label: "Origen", render: (row) => normalizeSource(row.utm_source) },
    { key: "telegram_user_id", label: "Telegram ID", render: (row) => row.telegram_user_id || "-" },
    { key: "inactiveDays", label: "Dias Inactivo", render: (row) => row.inactiveDays },
    { key: "active_flow", label: "Flujo", render: (row) => row.active_flow || "-" }
  ];

  const eventColumns = [
    { key: "created_at", label: "Timestamp", render: (row) => fmtDate(row.created_at) },
    { key: "visitor_id", label: "ID", render: (row) => <span className="font-mono text-blue-300">{shortId(row.visitor_id)}</span> },
    { key: "boton_clickado", label: "Boton", render: (row) => row.boton_clickado || "-" },
    { key: "utm_source", label: "Origen", render: (row) => normalizeSource(row.utm_source) },
    { key: "idioma", label: "Idioma", render: (row) => row.idioma || "-" },
    { key: "dispositivo", label: "Dispositivo", render: (row) => row.dispositivo || "-" }
  ];

  return (
    <div className="min-h-screen bg-[#080808] text-gray-100">
      <aside className="hidden md:flex flex-col z-40 w-[200px] h-full fixed left-0 top-0 border-r border-[#1e1e1e] bg-[#0d0d0d]">
        <div className="px-6 py-8">
          <h1 className="text-xl font-bold text-blue-500 tracking-tight">OF Agency</h1>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mt-1">Admin Panel</p>
        </div>

        <nav className="flex-1 px-2 space-y-1">
          {[
            ["dashboard", "Dashboard"],
            ["leads", "Leads"],
            ["vip", "VIP / Winback"],
            ["events", "Eventos"]
          ].map(([id, label]) => {
            const active = activeView === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveView(id)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors duration-200 ${
                  active ? "text-blue-400 bg-blue-500/10 border-l-2 border-blue-500" : "text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]"
                }`}
              >
                <span className="text-[11px] uppercase tracking-wider font-semibold">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#1e1e1e]">
          <p className="text-xs font-bold">Admin</p>
          <p className="text-[10px] text-gray-500">Secure Session</p>
        </div>
      </aside>

      <main className="ml-0 md:ml-[200px] min-h-screen pb-24 md:pb-8">
        <header className="flex justify-between items-center w-full px-6 h-16 sticky top-0 bg-[#080808]/90 backdrop-blur-md z-30 border-b border-[#1e1e1e]">
          <div className="flex items-center gap-4">
            <span className="text-lg font-bold tracking-tight">Tracking System</span>
            <span className="text-xs text-gray-500">{lastRefreshAt ? `Actualizado ${lastRefreshAt.toLocaleTimeString()}` : "Sin refresco"}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshAll}
              className="px-3 py-2 rounded-lg bg-[#111111] border border-[#1e1e1e] text-sm text-gray-200 hover:text-blue-300"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-3 py-2 rounded-lg bg-[#111111] border border-[#1e1e1e] text-sm text-red-300 hover:text-red-200"
            >
              Salir
            </button>
          </div>
        </header>

        <section className="p-6 md:p-10 max-w-[1400px] mx-auto">
          {activeView === "dashboard" ? (
            <>
              <div className="mb-12">
                <h2 className="text-3xl font-extrabold tracking-tight">Dashboard Overview</h2>
                <p className="text-gray-400 mt-1">Real-time performance analytics for OF Agency operations.</p>
              </div>

              <ErrorText text={sectionError.metrics} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <Card style={{ padding: 24 }}>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Total Leads</p>
                  <h3 className="text-4xl font-extrabold mt-3">{sectionLoading.metrics ? "..." : metrics?.total ?? "-"}</h3>
                </Card>
                <Card style={{ padding: 24 }}>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Entraron Telegram</p>
                  <h3 className="text-4xl font-extrabold mt-3">
                    {sectionLoading.metrics ? "..." : metrics ? `${metrics.telegramPct.toFixed(1)}%` : "-"}
                  </h3>
                </Card>
                <Card style={{ padding: 24 }}>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Convirtieron OF</p>
                  <h3 className="text-4xl font-extrabold mt-3">
                    {sectionLoading.metrics ? "..." : metrics ? `${metrics.ofPct.toFixed(1)}%` : "-"}
                  </h3>
                </Card>
                <Card style={{ padding: 24 }}>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400">Winback Pendiente</p>
                  <h3 className="text-4xl font-extrabold mt-3">{sectionLoading.metrics ? "..." : metrics?.winbackPending ?? "-"}</h3>
                </Card>
              </div>

              <Card style={{ padding: 24, marginBottom: 20 }}>
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h3 className="text-lg font-bold">Leads por red social</h3>
                    <p className="text-sm text-gray-400">Performance breakdown by acquisition channel</p>
                  </div>
                </div>

                <ErrorText text={sectionError.social} />
                {sectionLoading.social ? (
                  <p className="text-gray-400">Cargando estadísticas...</p>
                ) : (
                  <div className="h-[320px]">
                    <ResponsiveContainer>
                      <BarChart data={socialStats}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="sourceLabel" stroke="#9ca3af" />
                        <YAxis stroke="#9ca3af" />
                        <Tooltip
                          contentStyle={{ background: "#111111", border: "1px solid #1e1e1e", color: "#e5e2e1" }}
                          labelStyle={{ color: "#e5e2e1" }}
                        />
                        <Legend />
                        <Bar dataKey="total" name="Total" fill="#334155" />
                        <Bar dataKey="telegram" name="Telegram" fill="#3b82f6" />
                        <Bar dataKey="of" name="OF Conv." fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </>
          ) : null}

          {activeView === "leads" ? (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-extrabold tracking-tight mb-2">Leads Management</h1>
                <p className="text-gray-400 text-sm">Monitor and filter incoming user data across all traffic sources and funnel flows in real-time.</p>
              </div>

              <Card style={{ padding: 16, marginBottom: 16 }}>
                <div className="flex flex-col lg:flex-row gap-3 items-end lg:items-center">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 w-full">
                    <select
                      value={filterSource}
                      onChange={(event) => {
                        setLeadsPage(1);
                        setFilterSource(event.target.value);
                      }}
                      className="w-full bg-[#0d0d0d] border border-[#1e1e1e] text-sm rounded-lg py-2.5 px-3"
                    >
                      <option value="all">All Sources</option>
                      <option value="instagram">Instagram</option>
                      <option value="tiktok">TikTok</option>
                      <option value="twitter">Twitter</option>
                      <option value="reddit">Reddit</option>
                      <option value="direct">Direct</option>
                    </select>

                    <select
                      value={filterTelegram}
                      onChange={(event) => {
                        setLeadsPage(1);
                        setFilterTelegram(event.target.value);
                      }}
                      className="w-full bg-[#0d0d0d] border border-[#1e1e1e] text-sm rounded-lg py-2.5 px-3"
                    >
                      <option value="all">Telegram Any</option>
                      <option value="true">Telegram true</option>
                      <option value="false">Telegram false</option>
                    </select>

                    <select
                      value={filterOf}
                      onChange={(event) => {
                        setLeadsPage(1);
                        setFilterOf(event.target.value);
                      }}
                      className="w-full bg-[#0d0d0d] border border-[#1e1e1e] text-sm rounded-lg py-2.5 px-3"
                    >
                      <option value="all">OF Any</option>
                      <option value="true">OF true</option>
                      <option value="false">OF false</option>
                    </select>
                  </div>

                  <button type="button" onClick={loadLeads} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-semibold">
                    Apply
                  </button>
                </div>
              </Card>

              <Card style={{ overflow: "hidden" }}>
                <ErrorText text={sectionError.leads} />
                <DataTable columns={leadsColumns} rows={leadsRows} loading={sectionLoading.leads} emptyText="Sin leads" />
                <div className="px-6 py-4 flex items-center justify-between border-t border-[#1e1e1e] bg-[#0d0d0d]">
                  <p className="text-[11px] text-gray-500 uppercase tracking-widest font-semibold">
                    Pagina {leadsPage} de {totalLeadPages} · Total {leadsTotalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={leadsPage <= 1}
                      onClick={() => setLeadsPage((prev) => Math.max(1, prev - 1))}
                      className="w-8 h-8 flex items-center justify-center rounded border border-[#1e1e1e] bg-[#080808] text-gray-400 disabled:opacity-40"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={leadsPage >= totalLeadPages}
                      onClick={() => setLeadsPage((prev) => Math.min(totalLeadPages, prev + 1))}
                      className="w-8 h-8 flex items-center justify-center rounded border border-[#1e1e1e] bg-[#080808] text-gray-400 disabled:opacity-40"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </Card>
            </>
          ) : null}

          {activeView === "vip" ? (
            <>
              <div className="mb-8">
                <h2 className="text-3xl font-extrabold tracking-tight">VIP Leads & Winback</h2>
                <p className="text-gray-400 text-sm mt-1">Suscriptores activos y leads inactivos para reactivacion.</p>
              </div>

              <Card style={{ marginBottom: 16 }}>
                <div className="px-6 py-4 border-b border-[#1e1e1e] bg-[#0d0d0d]">
                  <h4 className="text-sm font-bold">Leads VIP (of_activo=true)</h4>
                </div>
                <ErrorText text={sectionError.vip} />
                <DataTable columns={vipColumns} rows={vipRows} loading={sectionLoading.vip} emptyText="Sin leads VIP" />
              </Card>

              <Card>
                <div className="px-6 py-4 border-b border-[#1e1e1e] bg-[#0d0d0d]">
                  <h4 className="text-sm font-bold">Winback Pendiente</h4>
                </div>
                <ErrorText text={sectionError.winback} />
                <DataTable columns={winbackColumns} rows={winbackRows} loading={sectionLoading.winback} emptyText="Sin winback pendiente" />
              </Card>
            </>
          ) : null}

          {activeView === "events" ? (
            <>
              <div className="mb-8">
                <h2 className="text-3xl font-extrabold tracking-tight">Eventos</h2>
                <p className="text-gray-400 text-sm mt-1">Monitoreo en tiempo real de interacciones externas.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <Card style={{ padding: 16 }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Eventos 50</span>
                  <div className="text-3xl font-extrabold mt-2">{eventsRows.length}</div>
                </Card>
                <Card style={{ padding: 16 }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Top Boton</span>
                  <div className="text-3xl font-extrabold mt-2">{eventsRows[0]?.boton_clickado || "-"}</div>
                </Card>
                <Card style={{ padding: 16 }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Modo</span>
                  <div className="mt-3">
                    <span className="px-2 py-1 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">LIVE</span>
                  </div>
                </Card>
              </div>

              <Card>
                <div className="px-6 py-4 border-b border-[#1e1e1e] bg-[#0d0d0d]">
                  <h4 className="text-sm font-bold">Eventos recientes (ultimos 50)</h4>
                </div>
                <ErrorText text={sectionError.events} />
                <DataTable columns={eventColumns} rows={eventsRows} loading={sectionLoading.events} emptyText="Sin eventos" />
              </Card>
            </>
          ) : null}
        </section>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 bg-[#0d0d0d]/95 backdrop-blur-lg flex justify-around items-center px-4 py-3 border-t border-[#1e1e1e]">
        {[
          ["dashboard", "Dashboard"],
          ["leads", "Leads"],
          ["vip", "VIP"],
          ["events", "Eventos"]
        ].map(([id, label]) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold ${active ? "bg-blue-500/20 text-blue-400" : "text-gray-500"}`}
            >
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
