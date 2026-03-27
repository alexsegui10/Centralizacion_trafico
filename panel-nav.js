(function () {
  var SESSION_KEY = "ofm_admin_session_v1";
  var page = (location.pathname.split("/").pop() || "admin.html").toLowerCase();

  if (page !== "login.html" && sessionStorage.getItem(SESSION_KEY) !== "1") {
    location.replace("login.html");
    return;
  }

  var mapByText = {
    Dashboard: "admin.html",
    Users: "users.html",
    Statistics: "statistics.html",
    Alerts: "alerts.html",
    Profile: "user_profile.html",
    Logout: "login.html"
  };

  var links = document.querySelectorAll("a[href]");
  links.forEach(function (a) {
    var text = (a.textContent || "").replace(/\s+/g, " ").trim();
    if (mapByText[text]) {
      a.setAttribute("href", mapByText[text]);
      if (text === "Logout") {
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
        location.href = "user_profile.html";
      }
    });
  });
})();
