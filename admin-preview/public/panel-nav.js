(function () {
  var SESSION_KEY = "ofm_admin_session_v1";
  var page = (location.pathname.split("/").pop() || "admin.html").toLowerCase();

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
      a.setAttribute("href", routeByToken[token]);
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
        location.href = "user_profile.html" + (visitorId ? "?visitor_id=" + encodeURIComponent(visitorId) : "");
      }
    });
  });
})();
