(function () {
  var SESSION_KEY = "ofm_admin_session_v1";
  var runtimeConfig = (typeof window !== "undefined" && window.__ADMIN_CONFIG) ? window.__ADMIN_CONFIG : {};
  var ADMIN_PASSWORD = runtimeConfig.ADMIN_PASSWORD || window.__ADMIN_PASSWORD || "CHANGE_ME";

  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    location.replace("admin.html");
    return;
  }

  var form = document.querySelector("form");
  var passwordInput = document.querySelector("#password");
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
    sessionStorage.setItem(SESSION_KEY, "1");
    location.href = "admin.html";
  });
})();
