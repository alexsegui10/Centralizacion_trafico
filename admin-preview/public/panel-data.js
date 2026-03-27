(function () {
  var runtimeConfig = (typeof window !== "undefined" && window.__ADMIN_CONFIG) ? window.__ADMIN_CONFIG : {};

  var SUPABASE_URL = runtimeConfig.SUPABASE_URL || "https://krnabtkugfzfinwvfuzm.supabase.co";
  var SUPABASE_ANON_KEY = runtimeConfig.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtybmFidGt1Z2Z6Zmlud3ZmdXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTIzODgsImV4cCI6MjA5MDAyODM4OH0.2JOYFbA1Wo_PlJw679dnHjHSBEp0AJrx_C6D91RdTvM";
  var SUPABASE_SERVICE_ROLE_KEY = runtimeConfig.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtybmFidGt1Z2Z6Zmlud3ZmdXptIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQ1MjM4OCwiZXhwIjoyMDkwMDI4Mzg4fQ.9WZ6RuQ6wpXhVHy2vpDIun9-9xMVDBsysCOGTBuDyEU";
  var ADMIN_PASSWORD = runtimeConfig.ADMIN_PASSWORD || "123456";

  var page = (location.pathname.split("/").pop() || "admin.html").toLowerCase();
  var cache = { leads: [], events: [], messages: [] };
  var autoRefreshTimer = null;
  var realtimeChannel = null;
  var CACHE_KEY = "ofm_admin_runtime_cache_v1";
  var CACHE_MAX_AGE_MS = 90 * 1000;

  var FLOW_NAMES = {
    "1": "MGO Directo",
    "2": "MGO Canal",
    "3": "Trafico Frio",
    "4": "VIP OnlyFans",
    "5": "Winback MGO",
    "6": "Conflicto"
  };

  function toast(msg, isError) {
    var id = "panel-toast-runtime";
    var old = document.getElementById(id);
    if (old) old.remove();
    var box = document.createElement("div");
    box.id = id;
    box.textContent = msg;
    box.style.position = "fixed";
    box.style.right = "16px";
    box.style.bottom = "16px";
    box.style.zIndex = "9999";
    box.style.padding = "10px 12px";
    box.style.borderRadius = "8px";
    box.style.fontSize = "12px";
    box.style.border = isError ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(34,197,94,0.4)";
    box.style.background = isError ? "rgba(127,29,29,0.8)" : "rgba(20,83,45,0.8)";
    box.style.color = "#fff";
    document.body.appendChild(box);
    setTimeout(function () {
      if (box && box.parentNode) box.parentNode.removeChild(box);
    }, 2800);
  }

  function sourceOf(lead) {
    if (lead.mgo_directo || lead.mgo_en_canal) return "mgo";
    var raw = String(lead.utm_source || "direct").toLowerCase();
    if (raw.indexOf("insta") >= 0) return "instagram";
    if (raw.indexOf("tiktok") >= 0) return "tiktok";
    if (raw === "x" || raw.indexOf("twitter") >= 0) return "x";
    if (raw.indexOf("reddit") >= 0) return "reddit";
    if (raw.indexOf("mgo") >= 0) return "mgo";
    return raw || "direct";
  }

  function sourceColor(src) {
    var map = {
      instagram: "#b6a0ff",
      tiktok: "#ff6c95",
      x: "#4cc9f0",
      twitter: "#4cc9f0",
      reddit: "#f97316",
      mgo: "#22c55e",
      direct: "#9ca3af"
    };
    return map[src] || "#9ca3af";
  }

  function inferFlow(lead) {
    if (String(lead.active_flow || "") === "6") return "6";
    if (lead.of_activo) return "4";
    if (lead.mgo_directo) return "1";
    if (lead.mgo_en_canal && !lead.mgo_directo) return "2";
    if (lead.telegram_activo && !lead.mgo_directo && !lead.mgo_en_canal && !lead.of_activo) return "3";

    var updated = new Date(lead.updated_at || lead.created_at || Date.now()).getTime();
    var days = (Date.now() - updated) / (1000 * 60 * 60 * 24);
    if (!lead.winback_sent && (lead.mgo_directo || lead.mgo_en_canal) && days > 14) return "5";
    return "3";
  }

  function fmtDate(v) {
    var d = new Date(v || Date.now());
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("es-ES");
  }

  function fmtSince(v) {
    var t = new Date(v || Date.now()).getTime();
    if (Number.isNaN(t)) return "-";
    var sec = Math.floor((Date.now() - t) / 1000);
    if (sec < 60) return sec + "s active";
    var min = Math.floor(sec / 60);
    if (min < 60) return min + "m active";
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h " + (min % 60) + "m active";
    return Math.floor(hr / 24) + "d active";
  }

  function countryToFlag(country) {
    var aliases = {
      "united states": "US", usa: "US", us: "US",
      "united kingdom": "GB", uk: "GB", gb: "GB",
      espana: "ES", spain: "ES", es: "ES",
      mexico: "MX", mx: "MX",
      argentina: "AR", ar: "AR",
      colombia: "CO", co: "CO",
      chile: "CL", cl: "CL",
      france: "FR", fr: "FR",
      germany: "DE", de: "DE",
      italy: "IT", it: "IT",
      brazil: "BR", br: "BR",
      canada: "CA", ca: "CA"
    };

    var raw = String(country || "").toLowerCase().trim();
    var code = aliases[raw] || raw.toUpperCase();
    if (code.length !== 2) return "🌍";
    return String.fromCodePoint.apply(null, code.split("").map(function (c) { return 127397 + c.charCodeAt(0); }));
  }

  function loadSupabaseScript() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && typeof window.supabase.createClient === "function") {
        resolve();
        return;
      }
      var existing = document.querySelector('script[data-supabase-umd="1"]');
      if (existing) {
        existing.addEventListener("load", resolve);
        existing.addEventListener("error", reject);
        return;
      }
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
      s.async = true;
      s.setAttribute("data-supabase-umd", "1");
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function loadWarmCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.ts || (Date.now() - parsed.ts > CACHE_MAX_AGE_MS)) {
        return null;
      }
      if (!Array.isArray(parsed.leads) || !Array.isArray(parsed.events)) {
        return null;
      }
      return {
        leads: parsed.leads,
        events: parsed.events
      };
    } catch (_err) {
      return null;
    }
  }

  function saveWarmCache() {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        leads: cache.leads || [],
        events: cache.events || []
      }));
    } catch (_err) {
      // Ignore storage quota/security errors and continue normally.
    }
  }

  function buildClients() {
    var make = window.supabase.createClient;
    var readClient = make(SUPABASE_URL, SUPABASE_ANON_KEY);
    var canUseService = SUPABASE_SERVICE_ROLE_KEY && SUPABASE_SERVICE_ROLE_KEY !== "CHANGE_ME_SERVICE_ROLE";
    var writeClient = canUseService ? make(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : readClient;

    if (!canUseService) {
      toast("Falta SUPABASE_SERVICE_ROLE_KEY para writes", true);
    }

    return { readClient: readClient, writeClient: writeClient };
  }

  function exportCsv(filename, rows) {
    if (!rows || !rows.length) return;
    var keys = Object.keys(rows[0]);
    var csv = [keys.join(",")].concat(rows.map(function (row) {
      return keys.map(function (k) { return JSON.stringify(row[k] == null ? "" : row[k]); }).join(",");
    })).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function ensureCanvas(container, id) {
    if (!container) return null;
    var old = container.querySelector("canvas[data-dyn='1']");
    if (old) return old;
    container.innerHTML = "";
    var c = document.createElement("canvas");
    c.setAttribute("data-dyn", "1");
    c.id = id;
    container.appendChild(c);
    return c;
  }

  function getTopCountries(leads) {
    var map = new Map();
    leads.forEach(function (l) {
      var c = String(l.pais || "").trim();
      if (!c) return;
      map.set(c, (map.get(c) || 0) + 1);
    });
    var total = Math.max(1, leads.length);
    return Array.from(map.entries())
      .map(function (x) { return { country: x[0], count: x[1], perc: ((x[1] / total) * 100).toFixed(1) }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  function renderDashboard(charts, leads) {
    var cards = document.querySelectorAll(".grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4 .text-2xl");
    if (cards.length >= 4) {
      cards[0].textContent = String(leads.length);
      cards[1].textContent = String(leads.filter(function (l) { return l.telegram_activo; }).length);
      cards[2].textContent = String(leads.filter(function (l) { return l.of_activo; }).length);
      cards[3].textContent = String(leads.filter(function (l) { return l.cupidbot_activo; }).length);
    }

    var sourceCard = Array.from(document.querySelectorAll("h2")).find(function (h) {
      return /traffic source distribution/i.test(h.textContent || "");
    });

    if (sourceCard && window.Chart) {
      var card = sourceCard.closest("div.lg\\:col-span-2") || sourceCard.closest("div.bg-surface-container");
      var chartRegion = card ? card.querySelector(".flex.items-end.justify-between") : null;
      var canvas = ensureCanvas(chartRegion, "dash-source-chart");
      if (canvas) {
        var sources = ["instagram", "tiktok", "x", "reddit", "mgo", "direct"];
        var tg = sources.map(function (s) {
          return leads.filter(function (l) { return sourceOf(l) === s && l.telegram_activo; }).length;
        });
        var of = sources.map(function (s) {
          return leads.filter(function (l) { return sourceOf(l) === s && l.of_activo; }).length;
        });

        if (charts.dashboardSource) charts.dashboardSource.destroy();
        charts.dashboardSource = new window.Chart(canvas, {
          type: "bar",
          data: {
            labels: ["INSTA", "TIKTOK", "X", "REDDIT", "MGO", "DIRECT"],
            datasets: [
              { label: "Telegram", data: tg, backgroundColor: "#00e3fd" },
              { label: "OnlyFans", data: of, backgroundColor: "#b6a0ff" }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: "#f8f5fd" } } },
            scales: {
              x: { stacked: true, ticks: { color: "#acaab1" }, grid: { color: "#2c2b33" } },
              y: { stacked: true, ticks: { color: "#acaab1" }, grid: { color: "#2c2b33" } }
            }
          }
        });
      }
    }

    var topCountries = getTopCountries(leads).slice(0, 2);
    var regionRows = document.querySelectorAll(".bg-surface-container-low .mt-4 .flex.justify-between.items-center");
    var progressBars = document.querySelectorAll(".bg-surface-container-low .mt-4 .w-full.bg-surface-container-highest .bg-secondary, .bg-surface-container-low .mt-4 .w-full.bg-surface-container-highest .bg-primary");
    if (regionRows.length >= 2 && topCountries.length >= 1) {
      for (var i = 0; i < Math.min(2, topCountries.length); i += 1) {
        var left = regionRows[i].querySelector("span:first-child");
        var right = regionRows[i].querySelector("span:last-child");
        if (left) left.textContent = topCountries[i].country;
        if (right) right.textContent = topCountries[i].perc + "%";
        if (progressBars[i]) progressBars[i].style.width = topCountries[i].perc + "%";
      }
    }

    var tableBody = document.querySelector("section table tbody");
    if (tableBody) {
      var flows = {
        "1": leads.filter(function (l) { return !!l.mgo_directo; }),
        "2": leads.filter(function (l) { return !!l.mgo_en_canal && !l.mgo_directo; }),
        "3": leads.filter(function (l) { return !!l.telegram_activo && !l.mgo_directo && !l.mgo_en_canal && !l.of_activo; }),
        "4": leads.filter(function (l) { return !!l.of_activo; }),
        "5": leads.filter(function (l) {
          var updated = new Date(l.updated_at || l.created_at || Date.now()).getTime();
          return !l.winback_sent && (l.mgo_directo || l.mgo_en_canal) && (Date.now() - updated > 14 * 24 * 3600 * 1000);
        }),
        "6": leads.filter(function (l) { return String(l.active_flow || "") === "6"; })
      };

      tableBody.innerHTML = "";
      ["1", "2", "3", "4", "5", "6"].forEach(function (id) {
        var rows = flows[id];
        var total = rows.length;
        var avgMin = total ? Math.max(1, Math.round(rows.reduce(function (acc, l) {
          return acc + Math.max(0, (new Date(l.updated_at || Date.now()) - new Date(l.created_at || Date.now())) / 60000);
        }, 0) / total)) : 0;
        var latest = total ? Math.max.apply(null, rows.map(function (l) { return new Date(l.updated_at || l.created_at || Date.now()).getTime(); })) : 0;
        var stale = total > 0 && (Date.now() - latest > 24 * 3600 * 1000);

        var tr = document.createElement("tr");
        tr.className = "hover:bg-surface-bright/50 transition-colors";
        tr.innerHTML = "<td class='px-6 py-4'><div class='flex items-center gap-3'><div class='w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-xs'>F" + id + "</div><div><p class='text-sm font-semibold text-on-surface'>" + FLOW_NAMES[id] + "</p><p class='text-[10px] text-on-surface-variant'>Flujo real</p></div></div></td>"
          + "<td class='px-6 py-4 text-sm font-medium'>" + total + "</td>"
          + "<td class='px-6 py-4 text-sm text-on-surface-variant'>" + (total ? avgMin + " min" : "-") + "</td>"
          + "<td class='px-6 py-4'><div class='w-24 bg-surface-container-lowest h-1.5 rounded-full overflow-hidden'><div class='bg-primary h-full' style='width:" + Math.min(100, total) + "%'></div></div></td>"
          + "<td class='px-6 py-4'><span class='px-2 py-1 rounded " + (stale || total === 0 ? "bg-yellow-500/10 text-yellow-300 border border-yellow-500/20" : "bg-green-500/10 text-green-400 border border-green-500/20") + " text-[10px] font-bold uppercase tracking-widest'>" + (stale || total === 0 ? "WARNING" : "OPERATIONAL") + "</span></td>"
          + "<td class='px-6 py-4 text-right'><button class='text-on-surface-variant hover:text-secondary'><span class='material-symbols-outlined'>more_horiz</span></button></td>";
        tableBody.appendChild(tr);
      });
    }

    var refreshBtn = Array.from(document.querySelectorAll("button")).find(function (b) {
      return /refresh data/i.test((b.textContent || "").trim());
    });
    if (refreshBtn) refreshBtn.onclick = function () { window.__panelReload && window.__panelReload(); };

    var exportBtn = Array.from(document.querySelectorAll("button")).find(function (b) {
      return /export report/i.test((b.textContent || "").trim());
    });
    if (exportBtn) exportBtn.onclick = function () { exportCsv("reporte_leads.csv", leads); };
  }

  function renderUsers(leads, writeClient) {
    var columns = Array.from(document.querySelectorAll(".kanban-column-scroll"));
    if (!columns.length) return;

    var byFlow = { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] };
    leads.forEach(function (l) { byFlow[inferFlow(l)].push(l); });

    columns.forEach(function (col, idx) {
      var flow = String(idx + 1);
      col.innerHTML = "";
      byFlow[flow].forEach(function (l) {
        var src = sourceOf(l);
        var color = sourceColor(src);
        var card = document.createElement("div");
        card.className = "bg-surface-container-high p-4 rounded-xl border-l-2 border-transparent hover:border-secondary transition-all cursor-pointer shadow-lg group";
        card.setAttribute("data-visitor-id", l.visitor_id || "");
        card.innerHTML = "<div class='flex justify-between items-start mb-3'>"
          + "<div class='w-10 h-10 rounded-full flex items-center justify-center text-black font-black text-sm' style='background:" + color + "'>" + String(l.visitor_id || "??").slice(0, 2).toUpperCase() + "</div>"
          + "<div class='flex flex-col items-end'><span class='text-[10px] text-on-surface-variant font-mono'>ID: " + String(l.visitor_id || "").slice(0, 8) + "</span><div class='mt-1 px-2 py-0.5 text-[9px] rounded uppercase font-bold' style='background:" + color + "33;color:" + color + "'>" + src + "</div></div></div>"
          + "<div class='space-y-2'><div class='flex items-center space-x-2 text-on-surface text-xs font-semibold'><span class='material-symbols-outlined text-sm text-secondary'>location_on</span><span>" + countryToFlag(l.pais) + " " + (l.ciudad || "-") + ", " + (l.pais || "-") + "</span></div>"
          + "<div class='flex items-center justify-between mt-4'><div class='flex items-center space-x-1 text-on-surface-variant text-[10px]'><span class='material-symbols-outlined text-xs'>schedule</span><span>" + fmtSince(l.created_at) + "</span></div><div class='flex space-x-1'>"
          + (l.cupidbot_activo ? "<span class='text-secondary text-lg'>🤖</span>" : "")
          + (String(l.active_flow || "") === "6" ? "<span class='text-tertiary text-lg'>⚠️</span>" : "")
          + "</div></div></div>";
        card.addEventListener("click", function () {
          location.href = "user_profile.html?visitor_id=" + encodeURIComponent(l.visitor_id || "");
        });
        col.appendChild(card);
      });
    });

    var searchInput = document.querySelector('input[placeholder*="Search User ID"]');
    if (searchInput && !searchInput.__boundSearch) {
      searchInput.__boundSearch = true;
      searchInput.addEventListener("input", function () {
        var q = String(searchInput.value || "").toLowerCase().trim();
        columns.forEach(function (col) {
          Array.from(col.children).forEach(function (card) {
            var text = String(card.textContent || "").toLowerCase();
            card.style.display = (!q || text.indexOf(q) >= 0) ? "" : "none";
          });
        });
      });
    }

    var filterBtn = Array.from(document.querySelectorAll("button")).find(function (b) {
      return /filters/i.test((b.textContent || "").trim());
    });
    if (filterBtn && !filterBtn.__boundFilter) {
      filterBtn.__boundFilter = true;
      filterBtn.addEventListener("click", function () {
        var old = document.getElementById("users-filters-dropdown");
        if (old) {
          old.remove();
          return;
        }
        var box = document.createElement("div");
        box.id = "users-filters-dropdown";
        box.className = "fixed right-8 top-28 z-[9999] rounded-lg border border-outline-variant/30 bg-[#1f1f26] p-3 text-xs shadow-2xl";
        box.innerHTML = "<div class='mb-2 font-bold'>Filtros</div>"
          + "<label class='block mb-1'>Fuente</label><select id='flt-source' class='mb-2 w-48 rounded bg-[#131318]'><option value='all'>all</option><option value='instagram'>instagram</option><option value='tiktok'>tiktok</option><option value='x'>x</option><option value='reddit'>reddit</option><option value='mgo'>mgo</option><option value='direct'>direct</option></select>"
          + "<label class='block mb-1'>CupidBot</label><select id='flt-cupid' class='w-48 rounded bg-[#131318]'><option value='all'>all</option><option value='on'>activo</option><option value='off'>inactivo</option></select>";
        document.body.appendChild(box);

        function applyFilters() {
          var src = document.getElementById("flt-source").value;
          var cupid = document.getElementById("flt-cupid").value;
          columns.forEach(function (col) {
            Array.from(col.children).forEach(function (card) {
              var t = String(card.textContent || "").toLowerCase();
              var bySrc = src === "all" || t.indexOf(src) >= 0;
              var byCupid = cupid === "all" || (cupid === "on" ? t.indexOf("🤖") >= 0 : t.indexOf("🤖") < 0);
              card.style.display = bySrc && byCupid ? "" : "none";
            });
          });
        }

        document.getElementById("flt-source").addEventListener("change", applyFilters);
        document.getElementById("flt-cupid").addEventListener("change", applyFilters);
      });
    }

    var activateBtn = Array.from(document.querySelectorAll("button")).find(function (b) {
      return /activate cupidbot/i.test((b.textContent || "").trim());
    });
    if (activateBtn && !activateBtn.__boundMassActivate) {
      activateBtn.__boundMassActivate = true;
      activateBtn.addEventListener("click", function () {
        var ids = leads
          .filter(function (l) { return inferFlow(l) === "3" && !l.cupidbot_activo; })
          .map(function (l) { return l.visitor_id; })
          .filter(Boolean);
        if (!ids.length) {
          toast("No hay leads para activar en Flujo 3", false);
          return;
        }
        activateBtn.disabled = true;
        var original = activateBtn.textContent;
        activateBtn.textContent = "Activando...";
        writeClient.from("leads").update({ cupidbot_activo: true }).in("visitor_id", ids).then(function (r) {
          activateBtn.disabled = false;
          activateBtn.textContent = original;
          if (r.error) {
            toast("Error: " + r.error.message, true);
            return;
          }
          toast("CupidBot activado para Flujo 3", false);
          window.__panelReload && window.__panelReload();
        });
      });
    }
  }

  function renderProfile(leads, events, writeClient, readClient) {
    var params = new URLSearchParams(location.search);
    var visitorId = params.get("visitor_id") || "";
    var lead = leads.find(function (l) { return String(l.visitor_id || "") === visitorId; }) || leads[0];
    if (!lead) return;

    var h1 = document.querySelector("h1.text-4xl");
    if (h1) h1.textContent = String(lead.visitor_id || "-");

    var subtitle = Array.from(document.querySelectorAll("p")).find(function (el) {
      return (el.textContent || "").indexOf("Lead Gen Strategy") >= 0;
    });
    if (subtitle) {
      subtitle.innerHTML = "Lead Gen Strategy: <span class='text-secondary'>" + FLOW_NAMES[inferFlow(lead)] + "</span>";
    }

    var idCore = Array.from(document.querySelectorAll("h3")).find(function (x) { return /identity core/i.test(x.textContent || ""); });
    if (idCore) {
      var root = idCore.parentElement;
      var rows = root.querySelectorAll(".space-y-4 > div");
      if (rows.length >= 6) {
        rows[0].querySelector("span:last-child").textContent = String(lead.visitor_id || "-");
        rows[1].querySelector("span.text-sm").textContent = (lead.pais || "-");
        rows[2].querySelector("span.text-sm").textContent = sourceOf(lead);
        rows[3].querySelector("span.text-sm").textContent = String(lead.dispositivo || "-") + " / " + String(lead.user_agent || "-").slice(0, 22);
        rows[4].querySelector("span.text-sm").textContent = fmtDate(lead.created_at);
        rows[5].querySelector("span.text-lg").textContent = fmtSince(lead.created_at);
      }

      var verifiedBadge = root.querySelector("span.px-2.py-0\.5");
      if (verifiedBadge && !lead.telegram_user_id) {
        verifiedBadge.textContent = "UNVERIFIED";
      }
    }

    var indicators = document.querySelectorAll(".grid.grid-cols-2.md\\:grid-cols-3 .bg-surface-container-high");
    if (indicators.length >= 6) {
      var values = [
        lead.telegram_activo ? ("@" + (lead.telegram_user_id || "activo")) : "Not Connected",
        lead.of_activo ? "Connected" : "Not Connected",
        lead.mgo_directo ? "Active Link" : "No Link",
        lead.mgo_en_canal ? ("#" + (lead.canal || "main")) : "Not Joined",
        FLOW_NAMES[inferFlow(lead)],
        lead.cupidbot_activo ? "RUNNING" : (lead.cupidbot_pausado ? "PAUSED" : "INACTIVE")
      ];
      indicators.forEach(function (card, i) {
        var valueNode = card.querySelector(".text-sm.font-semibold, .text-sm.font-black");
        if (valueNode && values[i]) valueNode.textContent = values[i];
      });
    }

    function bindAction(regex, fn, okMessage) {
      var btn = Array.from(document.querySelectorAll("button")).find(function (b) {
        return regex.test((b.textContent || "").trim());
      });
      if (!btn || btn.__boundAction) return;
      btn.__boundAction = true;
      btn.addEventListener("click", function () {
        btn.disabled = true;
        var prev = btn.innerHTML;
        btn.innerHTML = "<span class='spinner inline-block align-middle'></span>";
        fn().then(function (r) {
          btn.disabled = false;
          btn.innerHTML = prev;
          if (r && r.error) {
            toast("Error: " + r.error.message, true);
            return;
          }
          toast(okMessage, false);
          window.__panelReload && window.__panelReload();
        });
      });
    }

    bindAction(/activate bot/i, function () {
      return writeClient.from("leads").update({ cupidbot_activo: true, cupidbot_pausado: false }).eq("visitor_id", lead.visitor_id);
    }, "Bot activated");

    bindAction(/pause session/i, function () {
      return writeClient.from("leads").update({ cupidbot_pausado: true, cupidbot_activo: false }).eq("visitor_id", lead.visitor_id);
    }, "Session paused");

    bindAction(/upgrade vip/i, function () {
      return writeClient.from("leads").update({ of_activo: true, cupidbot_activo: false, cupidbot_pausado: false, active_flow: "4" }).eq("visitor_id", lead.visitor_id);
    }, "Upgraded to VIP");

    bindAction(/flag for conflict resolution/i, function () {
      return writeClient.from("leads").update({ active_flow: "6" }).eq("visitor_id", lead.visitor_id);
    }, "Flagged for conflict");

    var changeFlowBtn = Array.from(document.querySelectorAll("button")).find(function (b) {
      return /change flow/i.test((b.textContent || "").trim());
    });
    if (changeFlowBtn && !changeFlowBtn.__boundFlowPicker) {
      changeFlowBtn.__boundFlowPicker = true;
      changeFlowBtn.addEventListener("click", function () {
        var old = document.getElementById("flow-picker-runtime");
        if (old) old.remove();
        var box = document.createElement("div");
        box.id = "flow-picker-runtime";
        box.className = "fixed right-8 top-24 z-[9999] rounded-lg border border-outline-variant/30 bg-[#1f1f26] p-3 text-xs";
        box.innerHTML = "<div class='mb-2 font-bold'>Selecciona Flow</div><select id='flow-picker-select' class='w-40 rounded bg-[#131318]'>"
          + "<option value='1'>F1</option><option value='2'>F2</option><option value='3'>F3</option><option value='4'>F4</option><option value='5'>F5</option><option value='6'>F6</option>"
          + "</select><button id='flow-picker-save' class='ml-2 rounded bg-primary px-2 py-1 text-black font-bold'>Guardar</button>";
        document.body.appendChild(box);

        document.getElementById("flow-picker-save").addEventListener("click", function () {
          var flow = document.getElementById("flow-picker-select").value;
          writeClient.from("leads").update({ active_flow: flow }).eq("visitor_id", lead.visitor_id).then(function (r) {
            if (r.error) {
              toast("Error: " + r.error.message, true);
              return;
            }
            toast("Flow updated", false);
            box.remove();
            window.__panelReload && window.__panelReload();
          });
        });
      });
    }

    var exportLogsBtn = Array.from(document.querySelectorAll("button")).find(function (b) {
      return /export logs/i.test((b.textContent || "").trim());
    });
    if (exportLogsBtn && !exportLogsBtn.__boundExportLogs) {
      exportLogsBtn.__boundExportLogs = true;
      exportLogsBtn.addEventListener("click", function () {
        var own = events.filter(function (e) { return String(e.visitor_id || "") === String(lead.visitor_id || ""); });
        var blob = new Blob([JSON.stringify(own, null, 2)], { type: "application/json" });
        var u = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = u;
        a.download = "logs_" + String(lead.visitor_id || "visitor") + ".json";
        a.click();
        URL.revokeObjectURL(u);
      });
    }

    var timeline = Array.from(document.querySelectorAll("h3")).find(function (el) { return /activity timeline/i.test(el.textContent || ""); });
    if (timeline) {
      var boxTimeline = timeline.parentElement.querySelector(".space-y-8") || timeline.parentElement.querySelector(".space-y-6");
      if (boxTimeline) {
        readClient.from("eventos").select("*").eq("visitor_id", lead.visitor_id).order("created_at", { ascending: true }).then(function (r) {
          var evs = r.data || [];
          boxTimeline.innerHTML = "";

          function addPoint(title, detail, date) {
            var row = document.createElement("div");
            row.className = "relative";
            row.innerHTML = "<div class='absolute -left-[1.85rem] top-1 w-3 h-3 rounded-full bg-primary'></div><div class='flex flex-col'><span class='text-[10px] text-on-surface-variant'>" + fmtDate(date) + "</span><span class='text-sm font-bold'>" + title + "</span><span class='text-[11px] text-on-surface-variant'>" + detail + "</span></div>";
            boxTimeline.appendChild(row);
          }

          addPoint("Arrived on Landing Page", "Referral: " + sourceOf(lead), lead.created_at);
          if (lead.telegram_activo) addPoint("Joined Telegram Channel", "Usuario con Telegram activo", lead.updated_at);
          if (lead.of_activo) addPoint("OF Conversion Completed", "Usuario con OF activo", lead.updated_at);

          evs.forEach(function (e) {
            var click = String(e.boton_clickado || "").toLowerCase();
            var title = click === "telegram" ? "Telegram Handshake" : (click === "onlyfans" ? "OF Click Detected" : "Evento");
            var detail = click === "telegram" ? "User clicked Telegram link" : (click === "onlyfans" ? "User visited OnlyFans profile" : (e.boton_clickado || "Sin detalle"));
            addPoint(title, detail, e.created_at);
          });
        });
      }
    }

    var chatRoot = Array.from(document.querySelectorAll("h3")).find(function (el) { return /live bot session/i.test(el.textContent || ""); });
    if (chatRoot) {
      var panel = chatRoot.closest("div.bg-surface-container");
      var list = panel ? panel.querySelector(".flex-1.overflow-y-auto") : null;
      var input = panel ? panel.querySelector("input[placeholder*='Force bot response']") : null;
      var sendBtn = panel ? panel.querySelector("button .material-symbols-outlined[data-icon='send']") : null;
      var sendButton = sendBtn ? sendBtn.closest("button") : null;

      if (list) {
        readClient.from("mensajes").select("*").eq("visitor_id", lead.visitor_id).order("created_at", { ascending: true }).then(function (r) {
          var msgs = r.data || [];
          list.innerHTML = "";
          if (!msgs.length) {
            var empty = document.createElement("p");
            empty.className = "text-[11px] text-on-surface-variant";
            empty.textContent = "No bot session initiated yet";
            list.appendChild(empty);
          }
          msgs.forEach(function (m) {
            var isBot = String(m.tipo || "").toLowerCase() === "bot";
            var wrap = document.createElement("div");
            wrap.className = "flex flex-col " + (isBot ? "items-start" : "items-end") + " max-w-[85%] " + (isBot ? "" : "ml-auto");
            wrap.innerHTML = "<span class='text-[9px] uppercase font-bold " + (isBot ? "text-primary ml-1" : "text-secondary mr-1") + " mb-1'>" + (isBot ? ("BOT (" + (m.bot_tipo || "CupidBot") + ")") : "User") + "</span>"
              + "<div class='" + (isBot ? "bg-surface-container-high text-on-surface border border-outline-variant/10 rounded-lg rounded-tl-none" : "bg-secondary-container text-on-secondary-container rounded-lg rounded-tr-none") + " p-3 text-sm'>" + (m.contenido || "") + "</div>"
              + "<span class='text-[9px] text-on-surface-variant mt-1 " + (isBot ? "ml-1" : "mr-1") + "'>" + fmtDate(m.created_at) + "</span>";
            list.appendChild(wrap);
          });
        });
      }

      if (sendButton && input && !sendButton.__boundSendMsg) {
        sendButton.__boundSendMsg = true;
        sendButton.addEventListener("click", function () {
          var text = String(input.value || "").trim();
          if (!text) return;
          sendButton.disabled = true;
          writeClient.from("mensajes").insert({ visitor_id: lead.visitor_id, tipo: "bot", bot_tipo: "cupidbot", contenido: text }).then(function (r) {
            sendButton.disabled = false;
            if (r.error) {
              toast("Error: " + r.error.message, true);
              return;
            }
            input.value = "";
            toast("Respuesta enviada", false);
            window.__panelReload && window.__panelReload();
          });
        });
      }
    }
  }

  function renderStatistics(charts, leads, events) {
    var topCards = document.querySelectorAll(".grid.grid-cols-1.md\\:grid-cols-4 .text-2xl");
    if (topCards.length >= 4) {
      topCards[0].textContent = String(leads.filter(function (l) { return l.of_activo; }).length);
      topCards[1].textContent = String(leads.filter(function (l) { return l.telegram_activo; }).length);
      topCards[2].textContent = String(events.filter(function (e) { return String(e.boton_clickado || "").toLowerCase() === "onlyfans"; }).length);

      var conv = leads.filter(function (l) { return l.of_activo; });
      var avg = conv.length ? (conv.reduce(function (acc, l) {
        return acc + Math.max(0, (new Date(l.updated_at || Date.now()) - new Date(l.created_at || Date.now())) / (1000 * 60 * 60 * 24));
      }, 0) / conv.length).toFixed(1) : "0.0";
      topCards[3].textContent = avg + "d";
    }

    var range = Number((window.__statsRangeDays || 30));
    var days = [];
    for (var i = range - 1; i >= 0; i -= 1) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var key = d.toISOString().slice(0, 10);
      days.push({ key: key, label: key.slice(5), users: 0, tg: 0, of: 0 });
    }
    var dict = {};
    days.forEach(function (d) { dict[d.key] = d; });

    leads.forEach(function (l) {
      var k = String(l.created_at || "").slice(0, 10);
      if (!dict[k]) return;
      dict[k].users += 1;
      if (l.telegram_activo) dict[k].tg += 1;
    });
    events.forEach(function (e) {
      if (String(e.boton_clickado || "").toLowerCase() !== "onlyfans") return;
      var k = String(e.created_at || "").slice(0, 10);
      if (dict[k]) dict[k].of += 1;
    });

    var usersCard = Array.from(document.querySelectorAll("h4")).find(function (h) { return /new users velocity/i.test(h.textContent || ""); });
    var conversionsCard = Array.from(document.querySelectorAll("h4")).find(function (h) { return /channel conversions/i.test(h.textContent || ""); });

    if (window.Chart && usersCard) {
      var usersRegion = usersCard.closest("div").querySelector(".h-48");
      var usersCanvas = ensureCanvas(usersRegion, "stats-users-chart");
      if (usersCanvas) {
        if (charts.statsUsers) charts.statsUsers.destroy();
        charts.statsUsers = new window.Chart(usersCanvas, {
          type: "bar",
          data: {
            labels: days.map(function (d) { return d.label; }),
            datasets: [{ label: "New users", data: days.map(function (d) { return d.users; }), backgroundColor: "#b6a0ff" }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: "#f8f5fd" } } },
            scales: {
              x: { ticks: { color: "#acaab1" }, grid: { color: "#2c2b33" } },
              y: { ticks: { color: "#acaab1" }, grid: { color: "#2c2b33" } }
            }
          }
        });
      }
    }

    if (window.Chart && conversionsCard) {
      var convRegion = conversionsCard.closest("div").querySelector(".h-48");
      var convCanvas = ensureCanvas(convRegion, "stats-conv-chart");
      if (convCanvas) {
        if (charts.statsConv) charts.statsConv.destroy();
        charts.statsConv = new window.Chart(convCanvas, {
          type: "bar",
          data: {
            labels: days.map(function (d) { return d.label; }),
            datasets: [
              { label: "Telegram", data: days.map(function (d) { return d.tg; }), backgroundColor: "#00e3fd" },
              { label: "OnlyFans", data: days.map(function (d) { return d.of; }), backgroundColor: "#ff6c95" }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: "#f8f5fd" } } },
            scales: {
              x: { ticks: { color: "#acaab1" }, grid: { color: "#2c2b33" } },
              y: { ticks: { color: "#acaab1" }, grid: { color: "#2c2b33" } }
            }
          }
        });
      }
    }

    var sourceTableBody = document.querySelector("table.w-full.text-left tbody");
    if (sourceTableBody) {
      var groups = new Map();
      leads.forEach(function (l) {
        var src = sourceOf(l);
        var row = groups.get(src) || { src: src, total: 0, tg: 0, of: 0, convMs: 0, convCount: 0 };
        row.total += 1;
        if (l.telegram_activo) row.tg += 1;
        if (l.of_activo) {
          row.of += 1;
          row.convMs += Math.max(0, new Date(l.updated_at || Date.now()) - new Date(l.created_at || Date.now()));
          row.convCount += 1;
        }
        groups.set(src, row);
      });

      sourceTableBody.innerHTML = "";
      Array.from(groups.values()).sort(function (a, b) { return b.total - a.total; }).forEach(function (r) {
        var tgPct = r.total ? ((r.tg / r.total) * 100).toFixed(1) : "0.0";
        var ofPct = r.total ? ((r.of / r.total) * 100).toFixed(1) : "0.0";
        var avgDays = r.convCount ? (r.convMs / r.convCount / (1000 * 60 * 60 * 24)).toFixed(1) : "-";

        var tr = document.createElement("tr");
        tr.className = "group hover:bg-surface-bright/30 transition-colors";
        tr.innerHTML = "<td class='py-4 text-sm font-bold'><span class='uppercase'>" + r.src + "</span></td>"
          + "<td class='py-4 text-sm'>" + r.total + "</td>"
          + "<td class='py-4 text-sm'>" + tgPct + "%</td>"
          + "<td class='py-4 text-sm'>" + ofPct + "%</td>"
          + "<td class='py-4 text-sm font-bold text-right text-on-surface-variant'>" + avgDays + "d</td>";
        sourceTableBody.appendChild(tr);
      });
    }

    var cupidCard = Array.from(document.querySelectorAll("h4")).find(function (h) { return /cupidbot status/i.test(h.textContent || ""); });
    if (cupidCard) {
      var block = cupidCard.closest("div");
      var started = leads.filter(function (l) { return l.cupidbot_activo || l.last_bot_action; }).length;
      var convCount = leads.filter(function (l) { return (l.cupidbot_activo || l.last_bot_action) && l.of_activo; }).length;
      var rate = started ? ((convCount / started) * 100).toFixed(1) : "0.0";
      var avgSec = leads.length ? (leads.reduce(function (acc, l) {
        return acc + Math.max(0, (new Date(l.updated_at || Date.now()) - new Date(l.created_at || Date.now())) / 1000);
      }, 0) / leads.length).toFixed(1) : "0.0";

      var big = block.querySelector("h5.text-4xl");
      if (big) big.textContent = String(started);
      var stats = block.querySelectorAll(".text-xl.font-bold");
      if (stats.length >= 2) {
        stats[0].textContent = rate + "%";
        stats[1].textContent = avgSec + "s";
      }
    }

    var geoSection = Array.from(document.querySelectorAll("h4")).find(function (h) { return /geographic hubs/i.test(h.textContent || ""); });
    if (geoSection) {
      var section = geoSection.closest("div.bg-surface-container-high");
      var body = section ? section.querySelector("tbody") : null;
      if (body) {
        var top = getTopCountries(leads).slice(0, 8);
        body.innerHTML = "";
        top.forEach(function (c, i) {
          var tr = document.createElement("tr");
          tr.innerHTML = "<td class='py-4 text-xs font-bold text-primary'>" + String(i + 1).padStart(2, "0") + "</td>"
            + "<td class='py-4'><div class='flex items-center space-x-3'><span class='text-xl'>" + countryToFlag(c.country) + "</span><span class='text-sm font-bold'>" + c.country + "</span></div></td>"
            + "<td class='py-4 text-sm font-black text-right'>" + c.count + "</td>";
          body.appendChild(tr);
        });
      }

      var exportBtn = Array.from(document.querySelectorAll("button")).find(function (b) {
        return /export report/i.test((b.textContent || "").trim());
      });
      if (exportBtn && !exportBtn.__boundStatsExport) {
        exportBtn.__boundStatsExport = true;
        exportBtn.addEventListener("click", function () {
          exportCsv("stats_by_source.csv", cache.leads.map(function (l) {
            return {
              visitor_id: l.visitor_id,
              source: sourceOf(l),
              telegram_activo: !!l.telegram_activo,
              of_activo: !!l.of_activo,
              pais: l.pais || "",
              created_at: l.created_at || "",
              updated_at: l.updated_at || ""
            };
          }));
        });
      }

      var rangePickerMount = section.querySelector(".flex.items-center.space-x-4");
      if (rangePickerMount && !document.getElementById("stats-range-select")) {
        var select = document.createElement("select");
        select.id = "stats-range-select";
        select.className = "rounded bg-surface px-2 py-1 text-xs";
        select.innerHTML = "<option value='7'>Last 7 Days</option><option value='30' selected>Last 30 Days</option><option value='90'>Last 90 Days</option>";
        select.addEventListener("change", function () {
          window.__statsRangeDays = Number(select.value);
          renderStatistics(charts, cache.leads, cache.events);
        });
        rangePickerMount.appendChild(select);
      }
    }
  }

  function renderAlerts(leads, events, writeClient) {
    var activeTitle = Array.from(document.querySelectorAll("h2")).find(function (h) {
      return /active conflicts/i.test(h.textContent || "");
    });
    if (!activeTitle) return;

    var conflictGrid = activeTitle.parentElement.nextElementSibling;
    if (!conflictGrid) return;

    var conflicts = leads.filter(function (l) { return String(l.active_flow || "") === "6"; });
    conflictGrid.innerHTML = "";

    conflicts.forEach(function (l) {
      var card = document.createElement("div");
      card.className = "lg:col-span-6 bg-surface-container-high border-l-4 border-tertiary p-6";
      card.innerHTML = "<div class='flex items-center justify-between mb-3'><span class='px-2 py-0.5 bg-tertiary/10 text-tertiary text-[10px] font-bold rounded uppercase tracking-widest border border-tertiary/20'>CRITICAL</span><span class='text-on-surface-variant text-xs'>" + fmtSince(l.updated_at) + "</span></div>"
        + "<h3 class='text-lg font-bold text-on-surface mb-2'>" + (l.visitor_id || "-") + "</h3>"
        + "<p class='text-on-surface-variant text-sm mb-4'>Multiple variables active simultaneously - manual intervention required</p>"
        + "<div class='flex gap-3'><button class='take-control flex-1 py-2 text-primary font-bold text-xs border border-primary/30 rounded hover:bg-primary/10 transition-all'>Take Control</button><button class='resolve flex-1 py-2 text-on-surface-variant font-bold text-xs bg-surface-container-highest rounded hover:text-on-surface transition-all'>Resolve</button></div>";

      card.querySelector(".take-control").addEventListener("click", function () {
        var flow = l.telegram_activo ? "3" : (l.mgo_directo ? "1" : "2");
        writeClient.from("leads").update({ active_flow: flow }).eq("visitor_id", l.visitor_id).then(function (r) {
          if (r.error) {
            toast("Error: " + r.error.message, true);
            return;
          }
          toast("Conflict routed", false);
          location.href = "user_profile.html?visitor_id=" + encodeURIComponent(l.visitor_id || "");
        });
      });

      card.querySelector(".resolve").addEventListener("click", function () {
        writeClient.from("leads").update({ active_flow: null, cupidbot_activo: false }).eq("visitor_id", l.visitor_id).then(function (r) {
          if (r.error) {
            toast("Error: " + r.error.message, true);
            return;
          }
          toast("Conflict resolved", false);
          window.__panelReload && window.__panelReload();
        });
      });

      conflictGrid.appendChild(card);
    });

    var resolvedHeader = Array.from(document.querySelectorAll("h2")).find(function (h) {
      return /resolved history/i.test(h.textContent || "");
    });
    if (resolvedHeader) {
      var list = resolvedHeader.parentElement.nextElementSibling;
      if (list) {
        var rows = events.filter(function (e) {
          var b = String(e.boton_clickado || "").toLowerCase();
          return b.indexOf("resolve") >= 0 || b.indexOf("resuelto") >= 0 || b.indexOf("conflict") >= 0;
        }).slice(0, 30);

        list.innerHTML = "";
        rows.forEach(function (e) {
          var row = document.createElement("div");
          row.className = "bg-surface-container hover:bg-surface-container-high transition-colors px-6 py-4 flex items-center group";
          row.innerHTML = "<div class='w-10'><span class='material-symbols-outlined text-secondary text-sm' style=\"font-variation-settings: 'FILL' 1;\">check_circle</span></div>"
            + "<div class='flex-1 grid grid-cols-4 items-center'><div class='col-span-2'><h4 class='text-sm font-semibold text-on-surface'>" + (e.visitor_id || e.request_id || "-") + "</h4><p class='text-[11px] text-on-surface-variant'>" + (e.boton_clickado || "Conflict resolved") + "</p></div><div class='text-center'><span class='text-xs font-mono text-on-surface-variant'>ID: " + (e.id || "-") + "</span></div><div class='text-right'><span class='text-xs font-medium text-on-surface-variant'>" + fmtDate(e.created_at) + "</span></div></div>";
          list.appendChild(row);
        });
      }
    }
  }

  function bindRealtime(readClient) {
    if (realtimeChannel) {
      readClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    realtimeChannel = readClient
      .channel("admin-panel-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, function () {
        window.__panelReload && window.__panelReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "eventos" }, function () {
        window.__panelReload && window.__panelReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mensajes" }, function () {
        if (page === "user_profile.html") {
          window.__panelReload && window.__panelReload();
        }
      })
      .subscribe();
  }

  function start() {
    var clients = buildClients();
    var readClient = clients.readClient;
    var writeClient = clients.writeClient;
    var charts = { dashboardSource: null, statsUsers: null, statsConv: null };

    function renderCurrentPage() {
      if (page === "admin.html") renderDashboard(charts, cache.leads);
      if (page === "users.html") renderUsers(cache.leads, writeClient);
      if (page === "user_profile.html") renderProfile(cache.leads, cache.events, writeClient, readClient);
      if (page === "statistics.html") renderStatistics(charts, cache.leads, cache.events);
      if (page === "alerts.html") renderAlerts(cache.leads, cache.events, writeClient);
    }

    function loadAll() {
      return Promise.all([
        readClient.from("leads").select("*").order("updated_at", { ascending: false }).limit(5000),
        readClient.from("eventos").select("*").order("created_at", { ascending: false }).limit(5000)
      ]).then(function (res) {
        cache.leads = res[0].data || [];
        cache.events = res[1].data || [];
        saveWarmCache();
      });
    }

    window.__panelReload = function (opts) {
      opts = opts || {};
      var silentError = !!opts.silentError;
      loadAll()
        .then(function () {
          renderCurrentPage();
        })
        .catch(function (e) {
          if (!silentError) {
            toast("Error cargando datos: " + (e && e.message ? e.message : "unknown"), true);
          }
        });
    };

    var warm = loadWarmCache();
    if (warm) {
      cache.leads = warm.leads;
      cache.events = warm.events;
      renderCurrentPage();
    }

    window.__panelReload({ silentError: !!warm });
    bindRealtime(readClient);

    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(function () {
      window.__panelReload && window.__panelReload();
    }, 30000);

    if (page === "login.html") {
      window.__ADMIN_PASSWORD = ADMIN_PASSWORD;
    }
  }

  loadSupabaseScript().then(start).catch(function () {
    toast("No se pudo cargar Supabase UMD", true);
  });
})();
