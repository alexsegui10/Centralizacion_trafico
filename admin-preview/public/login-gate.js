(function () {
  var SESSION_KEY = "ofm_admin_session_v1";
  var NAV_LOADING_KEY = "ofm_nav_loading_v1";
  var runtimeConfig = (typeof window !== "undefined" && window.__ADMIN_CONFIG) ? window.__ADMIN_CONFIG : {};
  var ADMIN_PASSWORD = runtimeConfig.ADMIN_PASSWORD || window.__ADMIN_PASSWORD || "123456";

  function showNavLoading(message) {
    var old = document.getElementById("panel-login-loading");
    if (old) old.remove();
    var box = document.createElement("div");
    box.id = "panel-login-loading";
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

  function clearPreloadGate() {
    document.documentElement.removeAttribute("data-panel-preload");
  }

  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    showNavLoading("Redirecting...");
    location.replace("admin.html");
    return;
  }

  var form = document.querySelector("form");
  var passwordInput = document.querySelector("#password");
  clearPreloadGate();
  if (!form || !passwordInput) return;

  function showError(message) {
    var old = document.getElementById("login-error");
    if (old) old.remove();
    var p = document.createElement("p");
    p.id = "login-error";
    p.textContent = message;
    p.style.marginTop = "8px";
    p.style.fontSize = "12px";
    p.style.color = "#ff6e84";
    form.appendChild(p);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var pass = String(passwordInput.value || "").trim();
    if (pass !== ADMIN_PASSWORD) {
      showError("Invalid administrator password");
      return;
    }
    try {
      sessionStorage.setItem(NAV_LOADING_KEY, "1");
    } catch (_err) {
      // Ignore storage access issues.
    }
    showNavLoading("Loading admin panel...");
    sessionStorage.setItem(SESSION_KEY, "1");
    location.href = "admin.html";
  });
})();
