(function () {
  var SESSION_KEY = "ofm_admin_session_v1";
  var NAV_LOADING_KEY = "ofm_nav_loading_v1";
  var page = (location.pathname.split("/").pop() || "admin.html").toLowerCase();

  function showNavLoading(message) {
    var old = document.getElementById("panel-nav-loading");
    if (old) old.remove();

    var box = document.createElement("div");
    box.id = "panel-nav-loading";
    box.style.position = "fixed";
    box.style.inset = "0";
    box.style.zIndex = "99999";
    box.style.background = "#0e0e13";
    box.style.display = "flex";
    box.style.flexDirection = "column";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.color = "#f8f5fd";
    box.innerHTML = "<div style='width:42px;height:42px;border:3px solid rgba(182,160,255,0.25);border-top-color:#b6a0ff;border-radius:9999px;animation:panel-spin .7s linear infinite;'></div><p style='margin-top:14px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#acaab1;'>" + (message || "Loading...") + "</p>";

    var spinStyle = document.getElementById("panel-spin-style");
    if (!spinStyle) {
      spinStyle = document.createElement("style");
      spinStyle.id = "panel-spin-style";
      spinStyle.textContent = "@keyframes panel-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(spinStyle);
    }
    document.body.appendChild(box);
  }

  function beginPageTransition(message) {
    try {
      sessionStorage.setItem(NAV_LOADING_KEY, "1");
    } catch (_err) {
      // Ignore storage access issues.
    }
    showNavLoading(message || "Loading...");
  }

  if (page !== "login.html" && sessionStorage.getItem(SESSION_KEY) !== "1") {
    location.replace("login.html");
    return;
  }

  var routeByToken = {
    dashboard: "admin.html",
    users: "users.html",
    management: "users.html",
    statistics: "statistics.html",
    analytics: "statistics.html",
    alerts: "alerts.html",
    profile: "user_profile.html",
    logout: "login.html",
    home: "admin.html"
  };

  var links = document.querySelectorAll("a[href]");
  links.forEach(function (a) {
    var text = (a.textContent || "").toLowerCase().replace(/\s+/g, " ").trim();
    var token = null;
    Object.keys(routeByToken).some(function (key) {
      if (text.indexOf(key) !== -1) {
        token = key;
        return true;
      }
      return false;
    });
    if (token) {
      var target = routeByToken[token];
      a.setAttribute("href", target);
      a.addEventListener("click", function (e) {
        var href = target || a.getAttribute("href") || "";
        if (!href || href.charAt(0) === "#") return;
        e.preventDefault();
        if (token === "logout") {
          sessionStorage.removeItem(SESSION_KEY);
        }
        beginPageTransition(token === "logout" ? "Closing session..." : "Loading page...");
        location.href = href;
      });
      if (token === "logout") {
        a.addEventListener("click", function () {
          sessionStorage.removeItem(SESSION_KEY);
        });
      }
    }
  });

  var cards = document.querySelectorAll(".cursor-pointer");
  cards.forEach(function (el) {
    el.addEventListener("click", function () {
      if (page === "users.html") {
        var idNode = el.querySelector('[class*="font-mono"], [class*="ID:"]');
        var txt = idNode ? idNode.textContent || "" : "";
        var shortId = txt.replace(/[^A-Za-z0-9_-]/g, "");
        var visitorId = shortId.length ? shortId : "";
        beginPageTransition("Loading profile...");
        location.href = "user_profile.html" + (visitorId ? "?visitor_id=" + encodeURIComponent(visitorId) : "");
      }
    });
  });
})();
