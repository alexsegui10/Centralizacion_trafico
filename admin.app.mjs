// admin.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
var runtimeConfig = typeof window !== "undefined" && window.__ADMIN_CONFIG ? window.__ADMIN_CONFIG : {};
var SUPABASE_URL = runtimeConfig.SUPABASE_URL || "YOUR_SUPABASE_URL";
var SUPABASE_ANON_KEY = runtimeConfig.SUPABASE_ANON_KEY || "YOUR_ANON_KEY";
var ADMIN_PASSWORD = runtimeConfig.ADMIN_PASSWORD || "YOUR_PASSWORD";
var SESSION_KEY = "ofm_admin_session_v1";
var FLOW_NAMES = {
  "1": "Flow 1: Initial Hook",
  "2": "Flow 2: Engagement",
  "3": "Flow 3: Pitch",
  "4": "Flow 4: VIP",
  "5": "Flow 5: Winback",
  "6": "Flow 6: Conflict"
};
var supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
var SectionErrorBoundary = class extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, msg: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, msg: error?.message || "section_error" };
  }
  componentDidCatch() {
  }
  render() {
    if (this.state.hasError) {
      return /* @__PURE__ */ React.createElement("div", { className: "bg-[#111111] border border-[#1e1e1e] rounded-xl p-4 text-red-300 text-sm" }, "Section failed: ", this.state.msg);
    }
    return this.props.children;
  }
};
function fmtDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}
function shortId(v) {
  return String(v || "-").slice(0, 8);
}
function sourceOf(lead) {
  if (lead.mgo_directo || lead.mgo_en_canal) return "mgo";
  const raw = String(lead.utm_source || "direct").toLowerCase();
  if (raw.includes("insta")) return "instagram";
  if (raw.includes("tiktok")) return "tiktok";
  if (raw === "x" || raw.includes("twitter")) return "x";
  if (raw.includes("reddit")) return "reddit";
  if (raw.includes("mgo")) return "mgo";
  return raw || "direct";
}
function boolCount(lead) {
  return [lead.of_activo, lead.telegram_activo, lead.mgo_directo, lead.mgo_en_canal].filter(Boolean).length;
}
function inferFlow(lead, allowConflict = true) {
  const c = boolCount(lead);
  if (allowConflict && c >= 2) return "6";
  if (lead.of_activo) return "4";
  if (lead.mgo_directo) return "1";
  if (lead.mgo_en_canal && !lead.mgo_directo) return "2";
  if (lead.telegram_activo) return "3";
  const updatedAt = new Date(lead.updated_at || lead.created_at || Date.now()).getTime();
  const days = (Date.now() - updatedAt) / (1e3 * 60 * 60 * 24);
  if ((lead.mgo_directo || lead.mgo_en_canal) && days >= 14) return "5";
  return "1";
}
function countryFlag(country) {
  const map = {
    US: "\u{1F1FA}\u{1F1F8}",
    GB: "\u{1F1EC}\u{1F1E7}",
    UK: "\u{1F1EC}\u{1F1E7}",
    CA: "\u{1F1E8}\u{1F1E6}",
    AU: "\u{1F1E6}\u{1F1FA}",
    FR: "\u{1F1EB}\u{1F1F7}",
    ES: "\u{1F1EA}\u{1F1F8}",
    DE: "\u{1F1E9}\u{1F1EA}",
    BR: "\u{1F1E7}\u{1F1F7}",
    MX: "\u{1F1F2}\u{1F1FD}",
    AR: "\u{1F1E6}\u{1F1F7}",
    JP: "\u{1F1EF}\u{1F1F5}",
    AE: "\u{1F1E6}\u{1F1EA}"
  };
  const code = String(country || "").toUpperCase();
  return map[code] || "\u{1F310}";
}
function timeAgo(dateLike) {
  const ts = new Date(dateLike || Date.now()).getTime();
  if (Number.isNaN(ts)) return "-";
  const sec = Math.floor((Date.now() - ts) / 1e3);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}
function useRealtimeReload(onReload) {
  useEffect(() => {
    const channel = supabase.channel("admin-leads-realtime").on("postgres_changes", { event: "*", schema: "public", table: "leads" }, onReload).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [onReload]);
}
function Sidebar({ active, setActive, openProfile }) {
  const linkCls = "text-[#acaab1] py-3 px-6 hover:bg-[#19191f] flex items-center gap-3 font-medium text-sm transition-all duration-300 hover:text-[#00e3fd] hover:translate-x-1";
  const activeCls = "text-[#f8f5fd] bg-gradient-to-r from-[#b6a0ff]/20 to-transparent border-l-2 border-[#b6a0ff] py-3 px-6 flex items-center gap-3 font-medium text-sm";
  return /* @__PURE__ */ React.createElement("aside", { className: "fixed left-0 top-0 h-screen w-64 z-50 bg-[#131318] flex flex-col py-6" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 mb-10" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 mb-1" }, /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 bg-gradient-to-br from-primary to-primary-dim rounded flex items-center justify-center" }, /* @__PURE__ */ React.createElement("span", { className: "material-symbols-outlined text-on-primary-fixed", style: { fontVariationSettings: "'FILL' 1" } }, "bolt")), /* @__PURE__ */ React.createElement("span", { className: "text-lg font-black text-[#f8f5fd]" }, "Neon Noir")), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-on-surface-variant font-medium tracking-widest uppercase opacity-50" }, "Executive Suite")), /* @__PURE__ */ React.createElement("nav", { className: "flex-1 space-y-1" }, /* @__PURE__ */ React.createElement("button", { className: active === "dashboard" ? activeCls : linkCls, onClick: () => setActive("dashboard") }, "Dashboard"), /* @__PURE__ */ React.createElement("button", { className: active === "kanban" ? activeCls : linkCls, onClick: () => setActive("kanban") }, "Users"), /* @__PURE__ */ React.createElement("button", { className: active === "stats" ? activeCls : linkCls, onClick: () => setActive("stats") }, "Statistics"), /* @__PURE__ */ React.createElement("button", { className: active === "alerts" ? activeCls : linkCls, onClick: () => setActive("alerts") }, "Alerts"), openProfile ? /* @__PURE__ */ React.createElement("button", { className: active === "profile" ? activeCls : linkCls, onClick: () => setActive("profile") }, "Profile") : null));
}
function LoginScreen({ onAuth }) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (password !== ADMIN_PASSWORD) {
      setErr("Invalid administrator password");
      return;
    }
    sessionStorage.setItem(SESSION_KEY, "1");
    onAuth(userId || "EXECUTIVE_ID_001");
  };
  return /* @__PURE__ */ React.createElement("div", { className: "bg-surface font-body antialiased flex items-center justify-center min-h-screen selection:bg-primary selection:text-on-primary-fixed overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 pointer-events-none" }, /* @__PURE__ */ React.createElement("div", { className: "absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" }), /* @__PURE__ */ React.createElement("div", { className: "absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/5 rounded-full blur-[120px]" })), /* @__PURE__ */ React.createElement("main", { className: "relative z-10 w-full max-w-[420px] px-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center mb-10" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 bg-gradient-to-br from-primary to-primary-dim rounded-lg flex items-center justify-center mb-6 shadow-[0px_0px_20px_rgba(182,160,255,0.3)]" }, /* @__PURE__ */ React.createElement("span", { className: "material-symbols-outlined text-on-primary-fixed text-2xl" }, "lock")), /* @__PURE__ */ React.createElement("h1", { className: "text-on-surface text-xl font-bold tracking-tighter uppercase mb-1" }, "Admin Panel"), /* @__PURE__ */ React.createElement("p", { className: "text-on-surface-variant text-xs font-medium tracking-widest uppercase opacity-60" }, "System Access Protocol")), /* @__PURE__ */ React.createElement("div", { className: "border border-outline-variant/10 rounded-xl p-8 shadow-[0px_24px_48px_rgba(0,0,0,0.5)]", style: { backdropFilter: "blur(20px)", backgroundColor: "rgba(31,31,38,0.8)" } }, /* @__PURE__ */ React.createElement("form", { className: "space-y-6", onSubmit: submit }, /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] ml-1" }, "Administrator Identifier"), /* @__PURE__ */ React.createElement("input", { value: userId, onChange: (e) => setUserId(e.target.value), className: "w-full bg-surface-container-highest border border-outline-variant/20 rounded-lg py-4 px-4 text-sm text-on-surface", placeholder: "EXECUTIVE_ID_001" })), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement("label", { className: "block text-[10px] font-bold text-on-surface-variant uppercase tracking-[0.2em] ml-1" }, "Cryptographic Key"), /* @__PURE__ */ React.createElement("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), className: "w-full bg-surface-container-highest border border-outline-variant/20 rounded-lg py-4 px-4 text-sm text-on-surface", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" })), err ? /* @__PURE__ */ React.createElement("p", { className: "text-xs text-red-400" }, err) : null, /* @__PURE__ */ React.createElement("button", { className: "w-full bg-gradient-to-r from-primary to-primary-dim py-4 rounded-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-primary/10", type: "submit" }, /* @__PURE__ */ React.createElement("span", { className: "text-on-primary-fixed text-sm font-bold tracking-tight" }, "AUTHORIZE ACCESS"))))));
}
function AdminPanel() {
  const [authed, setAuthed] = useState(sessionStorage.getItem(SESSION_KEY) === "1");
  const [active, setActive] = useState("dashboard");
  const [leads, setLeads] = useState([]);
  const [events, setEvents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [feedback, setFeedback] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ source: "all", country: "all", flow: "all", cupid: "all" });
  const loadLeads = useCallback(async () => {
    const { data, error } = await supabase.from("leads").select("*").order("updated_at", { ascending: false }).limit(5e3);
    if (!error) setLeads(data || []);
  }, []);
  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase.from("eventos").select("*").order("created_at", { ascending: false }).limit(2e3);
    if (!error) setEvents(data || []);
  }, []);
  const loadMessages = useCallback(async (visitorId) => {
    if (!visitorId) return;
    const { data, error } = await supabase.from("mensajes").select("*").eq("visitor_id", visitorId).order("created_at", { ascending: true }).limit(1e3);
    if (!error) setMessages(data || []);
  }, []);
  const reloadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadLeads(), loadEvents()]);
    setLoading(false);
  }, [loadLeads, loadEvents]);
  useEffect(() => {
    if (authed) reloadAll();
  }, [authed, reloadAll]);
  useRealtimeReload(reloadAll);
  useEffect(() => {
    if (selectedLead?.visitor_id) loadMessages(selectedLead.visitor_id);
  }, [selectedLead, loadMessages]);
  const metrics = useMemo(() => {
    const total = leads.length;
    const telegram = leads.filter((l) => l.telegram_activo).length;
    const ofConv = leads.filter((l) => l.of_activo).length;
    const cupid = leads.filter((l) => l.cupidbot_activo).length;
    return { total, telegram, ofConv, cupid };
  }, [leads]);
  const sourceChart = useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    leads.forEach((l) => {
      const src = sourceOf(l);
      const base = map.get(src) || { source: src.toUpperCase(), total: 0, telegram: 0, of: 0 };
      base.total += 1;
      if (l.telegram_activo) base.telegram += 1;
      if (l.of_activo) base.of += 1;
      map.set(src, base);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [leads]);
  const flowStats = useMemo(() => {
    const total = Math.max(leads.length, 1);
    const map = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
    leads.forEach((l) => {
      const flow = String(l.active_flow || inferFlow(l));
      if (map[flow] !== void 0) map[flow] += 1;
    });
    return Object.keys(map).map((k) => ({
      flow: k,
      name: FLOW_NAMES[k],
      count: map[k],
      pct: (map[k] / total * 100).toFixed(1),
      ok: k !== "6"
    }));
  }, [leads]);
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const src = sourceOf(l);
      const flow = String(l.active_flow || inferFlow(l));
      const q = search.trim().toLowerCase();
      const bySearch = !q || String(l.visitor_id || "").toLowerCase().includes(q) || String(l.pais || "").toLowerCase().includes(q) || String(l.ciudad || "").toLowerCase().includes(q);
      const bySource = filters.source === "all" || src === filters.source;
      const byCountry = filters.country === "all" || String(l.pais || "").toLowerCase() === filters.country;
      const byFlow2 = filters.flow === "all" || flow === filters.flow;
      const byCupid = filters.cupid === "all" || (filters.cupid === "on" ? !!l.cupidbot_activo : !l.cupidbot_activo);
      return bySearch && bySource && byCountry && byFlow2 && byCupid;
    });
  }, [leads, search, filters]);
  const byFlow = useMemo(() => {
    const groups = { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] };
    filteredLeads.forEach((l) => {
      const f = String(l.active_flow || inferFlow(l));
      if (!groups[f]) groups[f] = [];
      groups[f].push(l);
    });
    return groups;
  }, [filteredLeads]);
  const last30 = useMemo(() => {
    const days = [];
    const now = /* @__PURE__ */ new Date();
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: key.slice(5), leads: 0, telegram: 0, of: 0 });
    }
    const dict = Object.fromEntries(days.map((d) => [d.key, d]));
    leads.forEach((l) => {
      const key = String(l.created_at || "").slice(0, 10);
      if (!dict[key]) return;
      dict[key].leads += 1;
      if (l.telegram_activo) dict[key].telegram += 1;
      if (l.of_activo) dict[key].of += 1;
    });
    return days;
  }, [leads]);
  const topCountries = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    leads.forEach((l) => {
      const c = String(l.pais || "").trim();
      if (!c) return;
      m.set(c, (m.get(c) || 0) + 1);
    });
    return Array.from(m.entries()).map(([k, v]) => ({ country: k, count: v })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [leads]);
  const topCities = useMemo(() => {
    const m = /* @__PURE__ */ new Map();
    leads.forEach((l) => {
      const c = String(l.ciudad || "").trim();
      if (!c) return;
      m.set(c, (m.get(c) || 0) + 1);
    });
    return Array.from(m.entries()).map(([k, v]) => ({ city: k, count: v })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [leads]);
  const sourceTable = useMemo(() => {
    const groups = /* @__PURE__ */ new Map();
    leads.forEach((l) => {
      const src = sourceOf(l);
      const g = groups.get(src) || { source: src, total: 0, telegram: 0, of: 0, sumDays: 0, conv: 0 };
      g.total += 1;
      if (l.telegram_activo) g.telegram += 1;
      if (l.of_activo) {
        g.of += 1;
        const ms = new Date(l.updated_at || l.created_at || Date.now()).getTime() - new Date(l.created_at || Date.now()).getTime();
        g.sumDays += Math.max(ms / (1e3 * 60 * 60 * 24), 0);
        g.conv += 1;
      }
      groups.set(src, g);
    });
    return Array.from(groups.values()).map((r) => ({
      ...r,
      telegramPct: r.total ? (r.telegram / r.total * 100).toFixed(1) : "0.0",
      ofPct: r.total ? (r.of / r.total * 100).toFixed(1) : "0.0",
      avgDays: r.conv ? (r.sumDays / r.conv).toFixed(1) : "-"
    }));
  }, [leads]);
  const cupidStats = useMemo(() => {
    const started = leads.filter((l) => l.cupidbot_activo || l.last_bot_action).length;
    const converted = leads.filter((l) => l.of_activo && (l.cupidbot_activo || l.last_bot_action)).length;
    const rate = started ? (converted / started * 100).toFixed(1) : "0.0";
    const avg = leads.length ? (leads.reduce((acc, l) => {
      const delta = new Date(l.updated_at || l.created_at || Date.now()).getTime() - new Date(l.created_at || Date.now()).getTime();
      return acc + Math.max(delta / 1e3, 0);
    }, 0) / leads.length).toFixed(1) : "0.0";
    return { started, converted, rate, avgSec: avg };
  }, [leads]);
  const conflictLeads = useMemo(() => leads.filter((l) => String(l.active_flow || inferFlow(l)) === "6"), [leads]);
  const resolvedAlerts = useMemo(
    () => events.filter(
      (e) => String(e.boton_clickado || "").toLowerCase().includes("conflict") || String(e.utm_source || "").toLowerCase().includes("conflict")
    ),
    [events]
  );
  const updateLead = useCallback(
    async (visitorId, patch, actionKey) => {
      setSaving((s) => ({ ...s, [actionKey]: true }));
      setFeedback("");
      const { error } = await supabase.from("leads").update(patch).eq("visitor_id", visitorId);
      setSaving((s) => ({ ...s, [actionKey]: false }));
      if (error) {
        setFeedback(`Error: ${error.message}`);
      } else {
        setFeedback("Saved successfully");
        await reloadAll();
      }
    },
    [reloadAll]
  );
  const profileTimeline = useMemo(() => {
    if (!selectedLead) return [];
    const ownEvents = events.filter((e) => e.visitor_id === selectedLead.visitor_id).map((e) => ({
      ts: e.created_at,
      title: `Event ${String(e.boton_clickado || "").toUpperCase()}`,
      detail: `${e.utm_source || "direct"} \xB7 ${e.dispositivo || "unknown"}`
    }));
    const leadEvents = [
      { ts: selectedLead.created_at, title: "Lead Created", detail: "Lead entered the system" },
      { ts: selectedLead.updated_at, title: "Lead Updated", detail: "Latest profile update" }
    ];
    return [...ownEvents, ...leadEvents].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  }, [selectedLead, events]);
  if (!authed) return /* @__PURE__ */ React.createElement(LoginScreen, { onAuth: () => setAuthed(true) });
  const countryOptions = Array.from(new Set(leads.map((l) => String(l.pais || "").toLowerCase()).filter(Boolean))).sort();
  return /* @__PURE__ */ React.createElement("div", { className: "dark bg-[#080808] text-[#f0f0f0] min-h-screen font-body" }, /* @__PURE__ */ React.createElement(Sidebar, { active, setActive, openProfile: !!selectedLead }), /* @__PURE__ */ React.createElement("header", { className: "fixed top-0 left-64 right-0 z-40 bg-[#0e0e13] shadow-[0px_24px_48px_rgba(0,0,0,0.5)] h-16 flex items-center justify-between px-6" }, /* @__PURE__ */ React.createElement("div", { className: "text-xs text-on-surface-variant uppercase tracking-widest" }, "Realtime Admin"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("button", { className: "px-3 py-2 bg-surface-container-high text-xs rounded", onClick: reloadAll }, loading ? "Refreshing..." : "Refresh"), /* @__PURE__ */ React.createElement("button", { className: "px-3 py-2 bg-[#25252c] text-xs rounded", onClick: () => {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false);
  } }, "Logout"))), /* @__PURE__ */ React.createElement("main", { className: "ml-64 pt-20 p-8 min-h-screen bg-surface" }, feedback ? /* @__PURE__ */ React.createElement("div", { className: "mb-4 text-xs px-3 py-2 bg-[#111111] border border-[#1e1e1e] rounded" }, feedback) : null, active === "dashboard" ? /* @__PURE__ */ React.createElement("div", { className: "space-y-8" }, /* @__PURE__ */ React.createElement(SectionErrorBoundary, null, /* @__PURE__ */ React.createElement("header", { className: "mb-2 flex justify-between items-end" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", { className: "text-3xl font-extrabold tracking-tighter text-on-surface mb-1" }, "Executive Dashboard"), /* @__PURE__ */ React.createElement("p", { className: "text-on-surface-variant" }, "Real-time performance metrics and user flow analysis.")))), /* @__PURE__ */ React.createElement(SectionErrorBoundary, null, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" }, /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container-high p-6" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-on-surface-variant" }, "Total Leads"), /* @__PURE__ */ React.createElement("h3", { className: "text-2xl font-black" }, metrics.total)), /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container-high p-6" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-on-surface-variant" }, "Active in Telegram"), /* @__PURE__ */ React.createElement("h3", { className: "text-2xl font-black" }, metrics.telegram)), /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container-high p-6" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-on-surface-variant" }, "OF Conversions"), /* @__PURE__ */ React.createElement("h3", { className: "text-2xl font-black" }, metrics.ofConv)), /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container-high p-6" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-on-surface-variant" }, "CupidBot Active Now"), /* @__PURE__ */ React.createElement("h3", { className: "text-2xl font-black" }, metrics.cupid)))), /* @__PURE__ */ React.createElement(SectionErrorBoundary, null, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-8" }, /* @__PURE__ */ React.createElement("div", { className: "lg:col-span-2 bg-surface-container p-6 rounded-lg" }, /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-bold text-on-surface mb-4" }, "Traffic Source Distribution"), /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: 300 } }, /* @__PURE__ */ React.createElement(ResponsiveContainer, null, /* @__PURE__ */ React.createElement(BarChart, { data: sourceChart }, /* @__PURE__ */ React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#2c2b33" }), /* @__PURE__ */ React.createElement(XAxis, { dataKey: "source", stroke: "#acaab1" }), /* @__PURE__ */ React.createElement(YAxis, { stroke: "#acaab1" }), /* @__PURE__ */ React.createElement(Tooltip, null), /* @__PURE__ */ React.createElement(Legend, null), /* @__PURE__ */ React.createElement(Bar, { dataKey: "total", fill: "#b6a0ff", stackId: "a" }), /* @__PURE__ */ React.createElement(Bar, { dataKey: "telegram", fill: "#00e3fd", stackId: "a" }), /* @__PURE__ */ React.createElement(Bar, { dataKey: "of", fill: "#ff6c95", stackId: "a" }))))), /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container-low p-6 flex flex-col relative overflow-hidden" }, /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-bold text-on-surface mb-6" }, "User Reach"), /* @__PURE__ */ React.createElement("div", { className: "flex-1 rounded bg-surface-container-highest/20 relative border border-outline-variant/10 p-4" }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 400 220", className: "w-full h-full opacity-70" }, /* @__PURE__ */ React.createElement("rect", { x: "5", y: "5", width: "390", height: "210", fill: "#19191f", stroke: "#2c2b33" }), /* @__PURE__ */ React.createElement("circle", { cx: "85", cy: "95", r: "4", fill: "#00e3fd" }), /* @__PURE__ */ React.createElement("circle", { cx: "190", cy: "80", r: "4", fill: "#b6a0ff" }), /* @__PURE__ */ React.createElement("circle", { cx: "300", cy: "130", r: "4", fill: "#ff6c95" }), /* @__PURE__ */ React.createElement("circle", { cx: "240", cy: "95", r: "3", fill: "#00e3fd" })))))), /* @__PURE__ */ React.createElement(SectionErrorBoundary, null, /* @__PURE__ */ React.createElement("section", { className: "bg-surface-container-high overflow-hidden shadow-2xl" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-outline-variant/5 flex justify-between items-center" }, /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-bold text-on-surface uppercase tracking-tight" }, "Active User Funnel Status")), /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-surface-container-lowest text-on-surface-variant uppercase text-[10px] font-bold tracking-widest" }, /* @__PURE__ */ React.createElement("th", { className: "px-6 py-4" }, "Flow Segment"), /* @__PURE__ */ React.createElement("th", { className: "px-6 py-4" }, "Total Users"), /* @__PURE__ */ React.createElement("th", { className: "px-6 py-4" }, "Percentage"), /* @__PURE__ */ React.createElement("th", { className: "px-6 py-4" }, "Health Status"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-outline-variant/5" }, flowStats.map((f) => /* @__PURE__ */ React.createElement("tr", { key: f.flow, className: "hover:bg-surface-bright/50 transition-colors" }, /* @__PURE__ */ React.createElement("td", { className: "px-6 py-4 text-sm font-semibold" }, f.name), /* @__PURE__ */ React.createElement("td", { className: "px-6 py-4 text-sm" }, f.count), /* @__PURE__ */ React.createElement("td", { className: "px-6 py-4 text-sm" }, f.pct, "%"), /* @__PURE__ */ React.createElement("td", { className: "px-6 py-4" }, /* @__PURE__ */ React.createElement("span", { className: `px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest border ${f.ok ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-error-container/10 text-error border-error-container/20"}` }, f.ok ? "Operational" : "Conflict")))))))))) : null, active === "kanban" ? /* @__PURE__ */ React.createElement(SectionErrorBoundary, null, /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-2xl font-extrabold tracking-tighter text-on-surface" }, "User Pipeline"), /* @__PURE__ */ React.createElement("p", { className: "text-on-surface-variant text-sm mt-1" }, "Live traffic monitoring across 6 key conversion funnels.")), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-5 gap-3" }, /* @__PURE__ */ React.createElement("input", { className: "bg-surface-container-high border-none rounded-lg px-4 py-2 text-on-surface", placeholder: "Search User ID, City, or Flow...", value: search, onChange: (e) => setSearch(e.target.value) }), /* @__PURE__ */ React.createElement("select", { className: "bg-surface-container-high border-none rounded-lg px-3 py-2", value: filters.source, onChange: (e) => setFilters((f) => ({ ...f, source: e.target.value })) }, /* @__PURE__ */ React.createElement("option", { value: "all" }, "Source: all"), /* @__PURE__ */ React.createElement("option", { value: "instagram" }, "instagram"), /* @__PURE__ */ React.createElement("option", { value: "tiktok" }, "tiktok"), /* @__PURE__ */ React.createElement("option", { value: "x" }, "x"), /* @__PURE__ */ React.createElement("option", { value: "reddit" }, "reddit"), /* @__PURE__ */ React.createElement("option", { value: "mgo" }, "mgo"), /* @__PURE__ */ React.createElement("option", { value: "direct" }, "direct")), /* @__PURE__ */ React.createElement("select", { className: "bg-surface-container-high border-none rounded-lg px-3 py-2", value: filters.country, onChange: (e) => setFilters((f) => ({ ...f, country: e.target.value })) }, /* @__PURE__ */ React.createElement("option", { value: "all" }, "Country: all"), countryOptions.map((c) => /* @__PURE__ */ React.createElement("option", { key: c, value: c }, c))), /* @__PURE__ */ React.createElement("select", { className: "bg-surface-container-high border-none rounded-lg px-3 py-2", value: filters.flow, onChange: (e) => setFilters((f) => ({ ...f, flow: e.target.value })) }, /* @__PURE__ */ React.createElement("option", { value: "all" }, "Flow: all"), /* @__PURE__ */ React.createElement("option", { value: "1" }, "1"), /* @__PURE__ */ React.createElement("option", { value: "2" }, "2"), /* @__PURE__ */ React.createElement("option", { value: "3" }, "3"), /* @__PURE__ */ React.createElement("option", { value: "4" }, "4"), /* @__PURE__ */ React.createElement("option", { value: "5" }, "5"), /* @__PURE__ */ React.createElement("option", { value: "6" }, "6")), /* @__PURE__ */ React.createElement("select", { className: "bg-surface-container-high border-none rounded-lg px-3 py-2", value: filters.cupid, onChange: (e) => setFilters((f) => ({ ...f, cupid: e.target.value })) }, /* @__PURE__ */ React.createElement("option", { value: "all" }, "Cupid: all"), /* @__PURE__ */ React.createElement("option", { value: "on" }, "active"), /* @__PURE__ */ React.createElement("option", { value: "off" }, "inactive"))), /* @__PURE__ */ React.createElement("div", { className: "flex space-x-6 min-h-0 overflow-x-auto pb-2" }, Object.keys(byFlow).map((flow) => /* @__PURE__ */ React.createElement("div", { key: flow, className: "flex-shrink-0 w-80 flex flex-col" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-4 px-1" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-sm text-on-surface" }, FLOW_NAMES[flow]), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-medium text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full" }, byFlow[flow].length)), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto space-y-4 pb-10 bg-surface-container-lowest rounded-xl p-4 max-h-[68vh]" }, byFlow[flow].map((l) => /* @__PURE__ */ React.createElement("button", { key: l.id, className: "w-full text-left bg-surface-container-high p-4 rounded-xl border-l-2 border-transparent hover:border-secondary transition-all cursor-pointer shadow-lg group", onClick: () => {
    setSelectedLead(l);
    setActive("profile");
  } }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-start mb-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-black text-sm" }, shortId(l.visitor_id).slice(0, 2).toUpperCase()), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-end" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-on-surface-variant font-mono" }, "ID: ", shortId(l.visitor_id)), /* @__PURE__ */ React.createElement("div", { className: "mt-1 px-2 py-0.5 bg-surface-bright text-[9px] rounded uppercase font-bold text-on-surface-variant" }, sourceOf(l)))), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center space-x-2 text-on-surface text-xs font-semibold" }, /* @__PURE__ */ React.createElement("span", null, countryFlag(l.pais)), /* @__PURE__ */ React.createElement("span", null, l.ciudad || "Unknown", ", ", l.pais || "--")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mt-4" }, /* @__PURE__ */ React.createElement("div", { className: "text-on-surface-variant text-[10px]" }, timeAgo(l.updated_at), " in flow"), /* @__PURE__ */ React.createElement("div", { className: "flex space-x-1" }, l.cupidbot_activo ? /* @__PURE__ */ React.createElement("span", { className: "material-symbols-outlined text-secondary text-lg", style: { fontVariationSettings: "'FILL' 1" } }, "smart_toy") : null, String(l.active_flow || inferFlow(l)) === "6" ? /* @__PURE__ */ React.createElement("span", { className: "material-symbols-outlined text-tertiary text-lg", style: { fontVariationSettings: "'FILL' 1" } }, "warning") : null))))))))))) : null, active === "profile" && selectedLead ? /* @__PURE__ */ React.createElement(SectionErrorBoundary, null, /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, /* @__PURE__ */ React.createElement("button", { className: "px-3 py-2 bg-surface-container-high rounded text-xs", onClick: () => setActive("kanban") }, "Back to Kanban"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-12 gap-6" }, /* @__PURE__ */ React.createElement("div", { className: "col-span-12 lg:col-span-4 space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container-high rounded-xl p-6 border-l-4 border-primary shadow-2xl" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4" }, "Identity Core"), /* @__PURE__ */ React.createElement("div", { className: "space-y-3 text-sm" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "visitor_id"), /* @__PURE__ */ React.createElement("span", { className: "font-mono" }, selectedLead.visitor_id)), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Country"), /* @__PURE__ */ React.createElement("span", null, countryFlag(selectedLead.pais), " ", selectedLead.pais || "--")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "City"), /* @__PURE__ */ React.createElement("span", null, selectedLead.ciudad || "--")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Source"), /* @__PURE__ */ React.createElement("span", null, sourceOf(selectedLead))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Device"), /* @__PURE__ */ React.createElement("span", null, selectedLead.dispositivo || "--")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Language"), /* @__PURE__ */ React.createElement("span", null, selectedLead.idioma || "--")), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "created_at"), /* @__PURE__ */ React.createElement("span", null, fmtDate(selectedLead.created_at))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "updated_at"), /* @__PURE__ */ React.createElement("span", null, fmtDate(selectedLead.updated_at))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "since first visit"), /* @__PURE__ */ React.createElement("span", null, timeAgo(selectedLead.created_at))))), /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container rounded-xl p-6" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4" }, "Strategic Actions"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("button", { disabled: saving.activate, className: "p-3 bg-surface-bright rounded text-xs", onClick: () => updateLead(selectedLead.visitor_id, { cupidbot_activo: true, cupidbot_pausado: false }, "activate") }, saving.activate ? "..." : "Activate CupidBot"), /* @__PURE__ */ React.createElement("button", { disabled: saving.pause, className: "p-3 bg-surface-bright rounded text-xs", onClick: () => updateLead(selectedLead.visitor_id, { cupidbot_pausado: true, cupidbot_activo: false }, "pause") }, saving.pause ? "..." : "Pause CupidBot"), /* @__PURE__ */ React.createElement("button", { disabled: saving.flow1, className: "p-3 bg-surface-bright rounded text-xs", onClick: () => updateLead(selectedLead.visitor_id, { active_flow: "1" }, "flow1") }, "Set Flow 1"), /* @__PURE__ */ React.createElement("button", { disabled: saving.flow2, className: "p-3 bg-surface-bright rounded text-xs", onClick: () => updateLead(selectedLead.visitor_id, { active_flow: "2" }, "flow2") }, "Set Flow 2"), /* @__PURE__ */ React.createElement("button", { disabled: saving.vip, className: "p-3 bg-primary text-on-primary-fixed rounded text-xs", onClick: () => updateLead(selectedLead.visitor_id, { of_activo: true, cupidbot_activo: false, cupidbot_pausado: false, active_flow: "4" }, "vip") }, saving.vip ? "..." : "Mark VIP"), /* @__PURE__ */ React.createElement("button", { disabled: saving.conflict, className: "p-3 bg-error-container/30 text-error rounded text-xs", onClick: () => updateLead(selectedLead.visitor_id, { active_flow: "6" }, "conflict") }, "Mark Conflict")), /* @__PURE__ */ React.createElement("button", { disabled: saving.resolve, className: "w-full mt-3 py-3 border border-secondary/30 text-secondary rounded text-[10px] font-bold uppercase tracking-widest", onClick: () => updateLead(selectedLead.visitor_id, { active_flow: inferFlow(selectedLead, false) }, "resolve") }, saving.resolve ? "Resolving..." : "Resolve Conflict"))), /* @__PURE__ */ React.createElement("div", { className: "col-span-12 lg:col-span-8 space-y-6" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-4" }, [{ k: "telegram_activo", l: "Telegram" }, { k: "of_activo", l: "OF" }, { k: "mgo_directo", l: "MGO Direct" }, { k: "mgo_en_canal", l: "MGO Channel" }, { k: "active_flow", l: "Active Flow" }, { k: "cupid", l: "CupidBot" }].map((b) => /* @__PURE__ */ React.createElement("div", { key: b.k, className: "bg-surface-container-high p-4 rounded-xl text-center" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase text-on-surface-variant" }, b.l), /* @__PURE__ */ React.createElement("div", { className: "text-sm font-bold mt-2" }, b.k === "active_flow" ? String(selectedLead.active_flow || inferFlow(selectedLead)) : null, b.k === "cupid" ? `${selectedLead.cupidbot_activo ? "ACTIVE" : "OFF"}${selectedLead.cupidbot_pausado ? " / PAUSED" : ""}` : null, b.k !== "active_flow" && b.k !== "cupid" ? selectedLead[b.k] ? "TRUE" : "FALSE" : null)))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6" }, /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container rounded-xl p-6" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-6" }, "Activity Timeline"), /* @__PURE__ */ React.createElement("div", { className: "relative pl-6 space-y-8 border-l border-outline-variant/30" }, profileTimeline.map((t, i) => /* @__PURE__ */ React.createElement("div", { key: `${t.ts}-${i}`, className: "relative" }, /* @__PURE__ */ React.createElement("div", { className: "absolute -left-[1.85rem] top-1 w-3 h-3 rounded-full bg-primary ring-4 ring-primary/20" }), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-on-surface-variant" }, fmtDate(t.ts)), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-bold" }, t.title), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-on-surface-variant" }, t.detail)))))), /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container rounded-xl p-0 flex flex-col h-[400px] overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "p-4 border-b border-outline-variant/10 bg-surface-container-high flex justify-between items-center" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold uppercase tracking-widest text-on-surface-variant" }, "Bot Message History")), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto p-4 space-y-4" }, messages.length === 0 ? /* @__PURE__ */ React.createElement("p", { className: "text-xs text-on-surface-variant" }, "No messages yet") : null, messages.map((m) => {
    const bot = String(m.tipo || "").toLowerCase() === "bot";
    return /* @__PURE__ */ React.createElement("div", { key: m.id, className: `flex flex-col ${bot ? "items-start" : "items-end"} max-w-[85%] ${bot ? "" : "ml-auto"}` }, /* @__PURE__ */ React.createElement("span", { className: `text-[9px] uppercase font-bold mb-1 ${bot ? "text-primary" : "text-secondary"}` }, bot ? m.bot_tipo || "CupidBot" : "User"), /* @__PURE__ */ React.createElement("div", { className: `${bot ? "bg-surface-container-high text-on-surface" : "bg-secondary-container text-on-secondary-container"} p-3 rounded-lg text-sm` }, m.contenido), /* @__PURE__ */ React.createElement("span", { className: "text-[9px] text-on-surface-variant mt-1" }, fmtDate(m.created_at)));
  })))))))) : null, active === "stats" ? /* @__PURE__ */ React.createElement(SectionErrorBoundary, null, /* @__PURE__ */ React.createElement("div", { className: "space-y-8" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6" }, /* @__PURE__ */ React.createElement("div", { className: "lg:col-span-2 bg-surface-container rounded-2xl p-6 border border-outline-variant/10" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-bold mb-4" }, "New Leads / Telegram / OF (last 30 days)"), /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: 320 } }, /* @__PURE__ */ React.createElement(ResponsiveContainer, null, /* @__PURE__ */ React.createElement(LineChart, { data: last30 }, /* @__PURE__ */ React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: "#2c2b33" }), /* @__PURE__ */ React.createElement(XAxis, { dataKey: "label", stroke: "#acaab1" }), /* @__PURE__ */ React.createElement(YAxis, { stroke: "#acaab1" }), /* @__PURE__ */ React.createElement(Tooltip, null), /* @__PURE__ */ React.createElement(Legend, null), /* @__PURE__ */ React.createElement(Line, { type: "monotone", dataKey: "leads", stroke: "#b6a0ff", strokeWidth: 2 }), /* @__PURE__ */ React.createElement(Line, { type: "monotone", dataKey: "telegram", stroke: "#00e3fd", strokeWidth: 2 }), /* @__PURE__ */ React.createElement(Line, { type: "monotone", dataKey: "of", stroke: "#ff6c95", strokeWidth: 2 }))))), /* @__PURE__ */ React.createElement("div", { className: "bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 rounded-2xl p-6" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-bold mb-4" }, "CupidBot Stats"), /* @__PURE__ */ React.createElement("div", { className: "space-y-3 text-sm" }, /* @__PURE__ */ React.createElement("div", null, "Conversations started: ", /* @__PURE__ */ React.createElement("strong", null, cupidStats.started)), /* @__PURE__ */ React.createElement("div", null, "Conversions to OF: ", /* @__PURE__ */ React.createElement("strong", null, cupidStats.converted)), /* @__PURE__ */ React.createElement("div", null, "Conversion rate: ", /* @__PURE__ */ React.createElement("strong", null, cupidStats.rate, "%")), /* @__PURE__ */ React.createElement("div", null, "Avg time: ", /* @__PURE__ */ React.createElement("strong", null, cupidStats.avgSec, "s"))))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 xl:grid-cols-3 gap-8" }, /* @__PURE__ */ React.createElement("div", { className: "xl:col-span-2 bg-surface-container rounded-2xl p-6 shadow-2xl border border-outline-variant/10 overflow-x-auto" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-bold mb-6" }, "Performance by Source"), /* @__PURE__ */ React.createElement("table", { className: "w-full text-left min-w-[680px]" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "border-b border-outline-variant/20" }, /* @__PURE__ */ React.createElement("th", { className: "pb-3" }, "Source"), /* @__PURE__ */ React.createElement("th", { className: "pb-3" }, "Total"), /* @__PURE__ */ React.createElement("th", { className: "pb-3" }, "% Telegram"), /* @__PURE__ */ React.createElement("th", { className: "pb-3" }, "% OF"), /* @__PURE__ */ React.createElement("th", { className: "pb-3" }, "Avg days to convert"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-outline-variant/10" }, sourceTable.map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.source }, /* @__PURE__ */ React.createElement("td", { className: "py-3 font-bold" }, r.source), /* @__PURE__ */ React.createElement("td", null, r.total), /* @__PURE__ */ React.createElement("td", null, r.telegramPct, "%"), /* @__PURE__ */ React.createElement("td", null, r.ofPct, "%"), /* @__PURE__ */ React.createElement("td", null, r.avgDays)))))), /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container rounded-2xl p-6 border border-outline-variant/10" }, /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-bold mb-3" }, "Top 10 Countries"), /* @__PURE__ */ React.createElement("div", { className: "space-y-2 text-sm mb-6" }, topCountries.map((c) => /* @__PURE__ */ React.createElement("div", { key: c.country, className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, countryFlag(c.country), " ", c.country), /* @__PURE__ */ React.createElement("strong", null, c.count)))), /* @__PURE__ */ React.createElement("h4", { className: "text-lg font-bold mb-3" }, "Top 10 Cities"), /* @__PURE__ */ React.createElement("div", { className: "space-y-2 text-sm" }, topCities.map((c) => /* @__PURE__ */ React.createElement("div", { key: c.city, className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, c.city), /* @__PURE__ */ React.createElement("strong", null, c.count)))))))) : null, active === "alerts" ? /* @__PURE__ */ React.createElement(SectionErrorBoundary, null, /* @__PURE__ */ React.createElement("div", { className: "space-y-10" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h1", { className: "text-4xl font-extrabold tracking-tight text-on-surface" }, "System Alerts"), /* @__PURE__ */ React.createElement("p", { className: "text-on-surface-variant" }, "Manage critical system conflicts and audit historical resolutions in real-time.")), /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container rounded-xl overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-outline-variant/10 font-bold" }, "Active Conflicts (", conflictLeads.length, ")"), /* @__PURE__ */ React.createElement("div", { className: "divide-y divide-outline-variant/10" }, conflictLeads.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "p-6 text-sm text-on-surface-variant" }, "No active conflicts") : null, conflictLeads.map((l) => /* @__PURE__ */ React.createElement("div", { key: l.id, className: "p-6 flex items-center justify-between gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "font-semibold" }, l.visitor_id), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-on-surface-variant" }, l.ciudad || "--", ", ", l.pais || "--", " \xB7 ", sourceOf(l))), /* @__PURE__ */ React.createElement("div", { className: "flex gap-3" }, /* @__PURE__ */ React.createElement("button", { className: "px-4 py-2 bg-tertiary text-on-tertiary-fixed text-xs font-bold rounded", disabled: saving[`take-${l.id}`], onClick: () => updateLead(l.visitor_id, { active_flow: inferFlow(l, false) }, `take-${l.id}`) }, saving[`take-${l.id}`] ? "..." : "Take Control"), /* @__PURE__ */ React.createElement("button", { className: "px-4 py-2 bg-surface-container-highest border border-outline-variant/30 text-on-surface text-xs font-bold rounded", disabled: saving[`res-${l.id}`], onClick: () => updateLead(l.visitor_id, { active_flow: inferFlow(l, false) }, `res-${l.id}`) }, saving[`res-${l.id}`] ? "..." : "Resolve")))))), /* @__PURE__ */ React.createElement("div", { className: "bg-surface-container rounded-xl overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-outline-variant/10 font-bold" }, "Past Resolved Alerts"), /* @__PURE__ */ React.createElement("div", { className: "divide-y divide-outline-variant/10" }, resolvedAlerts.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "p-6 text-sm text-on-surface-variant" }, "No resolved conflict events found in eventos yet.") : null, resolvedAlerts.map((e) => /* @__PURE__ */ React.createElement("div", { key: e.id, className: "p-6 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-sm font-semibold" }, e.request_id), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-on-surface-variant" }, e.visitor_id, " \xB7 ", String(e.boton_clickado || ""))), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-on-surface-variant" }, fmtDate(e.created_at)))))))) : null));
}
export {
  AdminPanel as default
};
