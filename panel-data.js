(function () {
  var SUPABASE_URL = "https://krnabtkugfzfinwvfuzm.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtybmFidGt1Z2Z6Zmlud3ZmdXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTIzODgsImV4cCI6MjA5MDAyODM4OH0.2JOYFbA1Wo_PlJw679dnHjHSBEp0AJrx_C6D91RdTvM";

  if (!window.supabase || typeof window.supabase.createClient !== "function") return;
  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var page = (location.pathname.split("/").pop() || "admin.html").toLowerCase();
  var flowNames = {
    "1": "MGO Directo",
    "2": "MGO Canal",
    "3": "Trafico Frio",
    "4": "VIP OnlyFans",
    "5": "Winback MGO",
    "6": "Conflicto"
  };

  function sourceOf(lead) {
    if (lead.mgo_directo || lead.mgo_en_canal) return "mgo";
    var s = String(lead.utm_source || "direct").toLowerCase();
    if (s.indexOf("insta") >= 0) return "instagram";
    if (s.indexOf("tiktok") >= 0) return "tiktok";
    if (s.indexOf("twitter") >= 0 || s === "x") return "x";
    if (s.indexOf("reddit") >= 0) return "reddit";
    return s || "direct";
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

  function fmtSince(dt) {
    var t = new Date(dt || Date.now()).getTime();
    if (Number.isNaN(t)) return "-";
    var sec = Math.floor((Date.now() - t) / 1000);
    if (sec < 60) return sec + "s active";
    var min = Math.floor(sec / 60);
    if (min < 60) return min + "m active";
    var h = Math.floor(min / 60);
    if (h < 24) return h + "h " + (min % 60) + "m active";
    return Math.floor(h / 24) + "d active";
  }

  function toFlag(country) {
    var code = String(country || "").trim().slice(0, 2).toUpperCase();
    if (code.length !== 2) return "🌍";
    return String.fromCodePoint.apply(null, code.split("").map(function (c) { return 127397 + c.charCodeAt(0); }));
  }

  function sourceColor(s) {
    return {
      instagram: "#b6a0ff",
      tiktok: "#ff6c95",
      x: "#4cc9f0",
      twitter: "#4cc9f0",
      reddit: "#f97316",
      mgo: "#22c55e",
      direct: "#9ca3af"
    }[s] || "#9ca3af";
  }

  function loadBaseData() {
    return Promise.all([
      client.from("leads").select("*").order("updated_at", { ascending: false }).limit(5000),
      client.from("eventos").select("*").order("created_at", { ascending: false }).limit(5000)
    ]).then(function (r) {
      return {
        leads: (r[0].data || []),
        events: (r[1].data || [])
      };
    });
  }

  function wireDashboard(data) {
    var leads = data.leads;
    var cards = document.querySelectorAll(".grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4 .text-2xl");
    if (cards.length >= 4) {
      cards[0].textContent = String(leads.length);
      cards[1].textContent = String(leads.filter(function (l) { return l.telegram_activo; }).length);
      cards[2].textContent = String(leads.filter(function (l) { return l.of_activo; }).length);
      cards[3].textContent = String(leads.filter(function (l) { return l.cupidbot_activo; }).length);
    }

    var tableBody = document.querySelector("section table tbody");
    if (tableBody) {
      var rows = {
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
        var total = rows[id].length;
        var tr = document.createElement("tr");
        tr.className = "hover:bg-surface-bright/50 transition-colors border-t border-outline-variant/10";
        tr.innerHTML = "<td class='px-6 py-4'><div class='flex items-center gap-3'><div class='w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary font-bold text-xs'>F" + id + "</div><div><p class='text-sm font-semibold text-on-surface'>" + flowNames[id] + "</p><p class='text-[10px] text-on-surface-variant'>Flujo real</p></div></div></td>"
          + "<td class='px-6 py-4 text-sm font-medium'>" + total + "</td>"
          + "<td class='px-6 py-4 text-sm text-on-surface-variant'>" + (total ? "~" + Math.max(1, Math.round(rows[id].reduce(function (acc, l) { return acc + ((new Date(l.updated_at || Date.now()) - new Date(l.created_at || Date.now())) / 60000); }, 0) / total)) + " min" : "-") + "</td>"
          + "<td class='px-6 py-4'><div class='w-24 bg-surface-container-lowest h-1.5 rounded-full overflow-hidden'><div class='bg-primary h-full' style='width:" + Math.min(100, total) + "%'></div></div></td>"
          + "<td class='px-6 py-4'><span class='px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest border " + (total ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-yellow-500/10 text-yellow-300 border-yellow-500/20") + "'>" + (total ? "OPERATIONAL" : "WARNING") + "</span></td>"
          + "<td class='px-6 py-4 text-right'><button class='text-on-surface-variant hover:text-secondary'><span class='material-symbols-outlined'>more_horiz</span></button></td>";
        tableBody.appendChild(tr);
      });
    }

    var refreshBtn = Array.from(document.querySelectorAll("button")).find(function (b) { return /refresh data/i.test(b.textContent || ""); });
    if (refreshBtn) refreshBtn.onclick = function () { location.reload(); };

    var exportBtn = Array.from(document.querySelectorAll("button")).find(function (b) { return /export report/i.test(b.textContent || ""); });
    if (exportBtn) {
      exportBtn.onclick = function () {
        if (!leads.length) return;
        var keys = Object.keys(leads[0]);
        var csv = [keys.join(",")].concat(leads.map(function (r) {
          return keys.map(function (k) { return JSON.stringify(r[k] == null ? "" : r[k]); }).join(",");
        })).join("\n");
        var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        var u = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = u;
        a.download = "reporte_leads.csv";
        a.click();
        URL.revokeObjectURL(u);
      };
    }
  }

  function wireUsers(data) {
    var leads = data.leads;
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
          + "<div class='space-y-2'><div class='flex items-center space-x-2 text-on-surface text-xs font-semibold'><span class='material-symbols-outlined text-sm text-secondary'>location_on</span><span>" + toFlag(l.pais) + " " + (l.ciudad || "-") + ", " + (l.pais || "-") + "</span></div>"
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
  }

  function wireStats(data) {
    var leads = data.leads;
    var events = data.events;

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
  }

  function wireAlerts(data) {
    var leads = data.leads;
    var conflicts = leads.filter(function (l) { return String(l.active_flow || "") === "6"; });

    var activeConflictsTitle = Array.from(document.querySelectorAll("h2,h3")).find(function (el) { return /active conflicts/i.test(el.textContent || ""); });
    if (!activeConflictsTitle) return;
    var listContainer = activeConflictsTitle.closest("div").nextElementSibling;
    if (!listContainer) return;

    listContainer.innerHTML = "";
    conflicts.forEach(function (l) {
      var row = document.createElement("div");
      row.className = "bg-surface-container-high border-l-4 border-tertiary p-4";
      row.innerHTML = "<div class='flex items-center justify-between gap-4'><div><div class='px-2 py-0.5 bg-tertiary/10 text-tertiary text-[10px] font-bold rounded uppercase tracking-widest border border-tertiary/20 inline-block'>CRITICAL</div><h3 class='text-lg font-bold text-on-surface mt-2'>" + (l.visitor_id || "-") + "</h3><p class='text-on-surface-variant text-sm'>Multiple variables active simultaneously - manual intervention required</p></div><div class='flex gap-2'><button class='take-control px-3 py-2 bg-secondary text-on-secondary-fixed text-xs rounded'>Take Control</button><button class='resolve px-3 py-2 bg-surface-container-highest border border-outline-variant/30 text-xs rounded'>Resolve</button></div></div>";

      row.querySelector(".take-control").addEventListener("click", function () {
        var flow = l.telegram_activo ? "3" : (l.mgo_directo ? "1" : "2");
        client.from("leads").update({ active_flow: flow }).eq("visitor_id", l.visitor_id).then(function () {
          location.href = "user_profile.html?visitor_id=" + encodeURIComponent(l.visitor_id || "");
        });
      });

      row.querySelector(".resolve").addEventListener("click", function () {
        client.from("leads").update({ active_flow: null, cupidbot_activo: false }).eq("visitor_id", l.visitor_id).then(function () {
          location.reload();
        });
      });

      listContainer.appendChild(row);
    });
  }

  function wireProfile(data) {
    var leads = data.leads;
    var params = new URLSearchParams(location.search);
    var visitorId = params.get("visitor_id") || "";
    var lead = leads.find(function (l) { return String(l.visitor_id || "") === visitorId; }) || leads[0];
    if (!lead) return;

    var h1 = document.querySelector("h1.text-4xl");
    if (h1) h1.textContent = String(lead.visitor_id || "-");

    var subtitle = Array.from(document.querySelectorAll("p")).find(function (el) {
      return (el.textContent || "").indexOf("Lead Gen Strategy") >= 0;
    });
    if (subtitle) subtitle.innerHTML = "Lead Gen Strategy: <span class='text-secondary'>" + flowNames[inferFlow(lead)] + "</span>";

    var timeline = Array.from(document.querySelectorAll("h3")).find(function (el) { return /activity timeline/i.test(el.textContent || ""); });
    if (timeline) {
      var box = timeline.parentElement.querySelector(".space-y-8") || timeline.parentElement.querySelector(".space-y-6");
      if (box) {
        client.from("eventos").select("*").eq("visitor_id", lead.visitor_id).order("created_at", { ascending: true }).then(function (r) {
          var evs = r.data || [];
          box.innerHTML = "";
          evs.forEach(function (e) {
            var click = String(e.boton_clickado || "").toLowerCase();
            var t = click === "telegram" ? "Telegram Handshake" : (click === "onlyfans" ? "OF Click Detected" : "Evento");
            var d = click === "telegram" ? "User clicked Telegram link" : (click === "onlyfans" ? "User visited OnlyFans profile" : (e.boton_clickado || "Sin detalle"));
            var row = document.createElement("div");
            row.className = "relative";
            row.innerHTML = "<div class='absolute -left-[1.85rem] top-1 w-3 h-3 rounded-full bg-primary'></div><div class='flex flex-col'><span class='text-[10px] text-on-surface-variant'>" + new Date(e.created_at || Date.now()).toLocaleString() + "</span><span class='text-sm font-bold'>" + t + "</span><span class='text-[11px] text-on-surface-variant'>" + d + "</span></div>";
            box.appendChild(row);
          });
        });
      }
    }
  }

  loadBaseData()
    .then(function (data) {
      if (page === "admin.html") wireDashboard(data);
      if (page === "users.html") wireUsers(data);
      if (page === "statistics.html") wireStats(data);
      if (page === "alerts.html") wireAlerts(data);
      if (page === "user_profile.html") wireProfile(data);

      client
        .channel("panel-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, function () { location.reload(); })
        .subscribe();
    })
    .catch(function () {
      // Keep UI intact if data fails.
    });
})();
