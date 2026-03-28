const i18n = {
  es: {
    btn_of: "Mi OnlyFans",
    btn_tg: "Telegram Gratis",
    footer: "Contenido solo para adultos +18"
  },
  en: {
    btn_of: "My OnlyFans",
    btn_tg: "Free Telegram",
    footer: "Adult content 18+ only"
  }
};

const VISITOR_COOKIE_DAYS = 400;
const UTM_COOKIE_DAYS = 400;
const TRACKING_TIMEOUT_MS = 300;
const PENDING_EVENTS_KEY = "pending_track_events";
const MAX_PENDING_EVENTS = 20;
const VISITOR_SYNC_CHANNEL = "ofm_visitor_sync_v1";
const API_BASE = "/api/proxy";
let hasNavigated = false;
let visitorSyncChannel = null;

function uuidv4() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function setCookie(name, value, days) {
  const expiresDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expiresDate.toUTCString()}; path=/; SameSite=Lax${secureFlag}`;
}

function getCookie(name) {
  const encoded = `${name}=`;
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(encoded)) {
      return decodeURIComponent(trimmed.substring(encoded.length));
    }
  }
  return null;
}

function readUrlParam(param) {
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get(param);
}

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Ignorar fallo de storage (modo privado/restricciones)
  }
}

function normalizeUtmSource(value) {
  if (!value || typeof value !== "string") {
    return "direct";
  }
  return value.toLowerCase().trim();
}

function normalizeLanguage(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase().trim();
  if (normalized === "es" || normalized === "en") {
    return normalized;
  }

  return null;
}

function sanitizeVisitorId(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveUtmSource() {
  const urlUtm = normalizeUtmSource(readUrlParam("utm_source"));
  const storedUtm = normalizeUtmSource(storageGet("utm_source") || getCookie("utm_source"));
  const finalUtm = urlUtm !== "direct" ? urlUtm : storedUtm || "direct";

  storageSet("utm_source", finalUtm);
  setCookie("utm_source", finalUtm, UTM_COOKIE_DAYS);

  return finalUtm;
}

function getExistingVisitorId() {
  const existingStorageId = sanitizeVisitorId(storageGet("visitor_id"));
  const existingCookieId = sanitizeVisitorId(getCookie("visitor_id"));
  return existingStorageId || existingCookieId || null;
}

function persistVisitorId(visitorId) {
  const safeVisitorId = sanitizeVisitorId(visitorId);
  if (!safeVisitorId) {
    return;
  }
  storageSet("visitor_id", safeVisitorId);
  setCookie("visitor_id", safeVisitorId, VISITOR_COOKIE_DAYS);
}

function initCrossTabSync() {
  if ("BroadcastChannel" in window) {
    try {
      visitorSyncChannel = new BroadcastChannel(VISITOR_SYNC_CHANNEL);
      visitorSyncChannel.onmessage = (event) => {
        const data = event.data || {};
        if (data.type !== "visitor_id") {
          return;
        }
        if (data.modelo_id !== MODELO_ID) {
          return;
        }
        const incomingVisitorId = sanitizeVisitorId(data.visitor_id);
        if (!incomingVisitorId) {
          return;
        }
        persistVisitorId(incomingVisitorId);
      };
    } catch (error) {
      visitorSyncChannel = null;
    }
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== "visitor_id") {
      return;
    }
    const incomingVisitorId = sanitizeVisitorId(event.newValue);
    if (!incomingVisitorId) {
      return;
    }
    persistVisitorId(incomingVisitorId);
  });
}

function broadcastVisitorId(visitorId) {
  if (!visitorSyncChannel) {
    return;
  }
  try {
    visitorSyncChannel.postMessage({
      type: "visitor_id",
      modelo_id: MODELO_ID,
      visitor_id: visitorId
    });
  } catch (error) {
    // Ignorar error de broadcast
  }
}

function detectLanguage() {
  const manualLanguage = normalizeLanguage(storageGet("lang_manual"));
  if (manualLanguage) {
    return manualLanguage;
  }

  const forcedLanguageByUtm = {
    instagram: "es",
    tiktok: "es",
    twitter: "en",
    reddit: "en"
  };

  const utmSource = normalizeUtmSource(storageGet("utm_source"));
  if (Object.prototype.hasOwnProperty.call(forcedLanguageByUtm, utmSource)) {
    return forcedLanguageByUtm[utmSource];
  }

  const langParam = normalizeLanguage(readUrlParam("lang"));
  if (langParam) {
    return langParam;
  }

  const navigatorLanguage = (navigator.language || "").toLowerCase();
  if (navigatorLanguage.startsWith("en")) {
    return "en";
  }

  return "es";
}

function detectDevice() {
  const ua = (navigator.userAgent || "").toLowerCase();
  const width = window.innerWidth;

  const isTabletUA = /ipad|tablet|playbook|silk|kindle/.test(ua);
  const isMobileUA = /iphone|ipod|android|mobile|mobi/.test(ua);

  if (isTabletUA || (width >= 768 && width <= 1024)) {
    return "tablet";
  }

  if (isMobileUA || width < 768) {
    return "mobile";
  }

  return "desktop";
}

function generateCanvasHash() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 40;
    const context = canvas.getContext("2d");

    if (!context) {
      return "canvas-unavailable";
    }

    context.textBaseline = "top";
    context.font = "14px Arial";
    context.fillStyle = "#f60";
    context.fillRect(0, 0, 200, 40);
    context.fillStyle = "#069";
    context.fillText("fingerprintXYZ", 2, 2);
    context.fillStyle = "rgba(102,204,0,0.7)";
    context.fillText("fingerprintXYZ", 4, 4);

    return canvas.toDataURL().slice(-40);
  } catch (error) {
    return "canvas-error";
  }
}

function buildFingerprint() {
  return {
    screen: `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezone_offset: new Date().getTimezoneOffset(),
    languages: navigator.languages?.join(",") || navigator.language,
    platform: navigator.platform,
    ram: navigator.deviceMemory || null,
    cpu_cores: navigator.hardwareConcurrency || null,
    touch_points: navigator.maxTouchPoints,
    canvas_hash: generateCanvasHash(),
    referrer: document.referrer || "direct"
  };
}

async function hashFingerprint(fingerprintObject) {
  const payload = JSON.stringify(fingerprintObject);

  if (!window.crypto || !window.crypto.subtle) {
    return "sha256-unavailable";
  }

  const digestBuffer = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload)
  );

  return Array.from(new Uint8Array(digestBuffer))
    .map((byteValue) => byteValue.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchVisitorByFingerprint(fingerprintHash) {
  if (!fingerprintHash || fingerprintHash === "sha256-unavailable") {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}?target=visitor&fingerprint=${encodeURIComponent(fingerprintHash)}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return null;
    }

    const responseData = await response.json();
    if (responseData && typeof responseData.visitor_id === "string" && responseData.visitor_id.trim()) {
      return sanitizeVisitorId(responseData.visitor_id);
    }

    return null;
  } catch (error) {
    return null;
  }
}

function getPendingEvents() {
  try {
    const raw = storageGet(PENDING_EVENTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function setPendingEvents(events) {
  try {
    storageSet(PENDING_EVENTS_KEY, JSON.stringify(events));
  } catch (error) {
    // Ignorar errores de almacenamiento
  }
}

function enqueuePendingEvent(payload) {
  const queue = getPendingEvents();
  const requestId = payload?.request_id;

  if (requestId) {
    const existingIndex = queue.findIndex((item) => item && item.request_id === requestId);
    if (existingIndex !== -1) {
      queue[existingIndex] = payload;
    } else {
      queue.push(payload);
    }
  } else {
    queue.push(payload);
  }

  if (queue.length > MAX_PENDING_EVENTS) {
    queue.splice(0, queue.length - MAX_PENDING_EVENTS);
  }
  setPendingEvents(queue);
}

async function postTrack(payload, useBeacon) {
  try {
    const proxyTrackUrl = `${API_BASE}?target=track`;

    if (useBeacon && navigator.sendBeacon) {
      const body = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const queued = navigator.sendBeacon(proxyTrackUrl, body);
      if (queued) {
        return true;
      }
    }

    await Promise.race([
      fetch(proxyTrackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      }),
      new Promise((resolve) => setTimeout(resolve, TRACKING_TIMEOUT_MS))
    ]);

    return true;
  } catch (error) {
    return false;
  }
}

async function flushPendingEvents() {
  const queue = getPendingEvents();
  if (!queue.length) {
    return;
  }

  const stillPending = [];

  for (const eventPayload of queue) {
    const sent = await postTrack(eventPayload, false);
    if (!sent) {
      stillPending.push(eventPayload);
    }
  }

  setPendingEvents(stillPending);
}

function flushPendingEventsOnHidden() {
  const queue = getPendingEvents();
  if (!queue.length) {
    return;
  }

  if (!navigator.sendBeacon) {
    return;
  }

  const stillPending = [];

  for (const eventPayload of queue) {
    try {
      const body = new Blob([JSON.stringify(eventPayload)], { type: "application/json" });
      const queued = navigator.sendBeacon(`${API_BASE}?target=track`, body);
      if (!queued) {
        stillPending.push(eventPayload);
      }
    } catch (error) {
      stillPending.push(eventPayload);
    }
  }

  setPendingEvents(stillPending);
}

async function resolveVisitorIdentity() {
  const existingVisitorId = getExistingVisitorId();

  if (existingVisitorId) {
    persistVisitorId(existingVisitorId);
    const fingerprintHash = await hashFingerprint(buildFingerprint());
    return { visitorId: existingVisitorId, fingerprintHash };
  }

  const fingerprintHash = await hashFingerprint(buildFingerprint());
  const recoveredVisitorId = await fetchVisitorByFingerprint(fingerprintHash);

  if (recoveredVisitorId) {
    persistVisitorId(recoveredVisitorId);
    return { visitorId: recoveredVisitorId, fingerprintHash };
  }

  const newVisitorId = uuidv4();
  persistVisitorId(newVisitorId);
  return { visitorId: newVisitorId, fingerprintHash };
}

function appendRefParam(baseUrl, visitorId) {
  if (!baseUrl || baseUrl.startsWith("#")) {
    return baseUrl;
  }

  try {
    const parsedUrl = new URL(baseUrl, window.location.origin);
    parsedUrl.searchParams.set("ref", visitorId);

    const isAbsolute = /^https?:\/\//i.test(baseUrl);
    if (isAbsolute) {
      return parsedUrl.toString();
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch (error) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}ref=${encodeURIComponent(visitorId)}`;
  }
}

function buildLinks(visitorId, telegramOverrideLink) {
  const ofBase = MODEL_CONFIG.links.onlyfans;
  const tgBase = MODEL_CONFIG.links.telegram;

  const ofLink = appendRefParam(ofBase, visitorId);
  const tgLink = telegramOverrideLink || appendRefParam(tgBase, visitorId);

  document.getElementById("btn-of").href = ofLink;
  document.getElementById("btn-tg").href = tgLink;
}

function setTelegramButtonLoading(isLoading) {
  const telegramButton = document.getElementById("btn-tg");
  const telegramLabel = document.getElementById("label-tg");
  if (!telegramButton || !telegramLabel) {
    return;
  }

  if (isLoading) {
    telegramButton.style.visibility = "hidden";
    telegramButton.setAttribute("aria-busy", "true");
    telegramButton.setAttribute("data-loading", "true");
  } else {
    telegramButton.style.visibility = "visible";
    telegramButton.removeAttribute("aria-busy");
    telegramButton.removeAttribute("data-loading");
  }
}

async function fetchTelegramInviteLink(visitorId) {
  try {
    const response = await Promise.race([
      fetch(`${API_BASE}?target=invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          visitor_id: visitorId,
          modelo_id: MODELO_ID
        })
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), 1200))
    ]);

    if (!response) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data && typeof data.invite_link === "string" && data.invite_link.trim()) {
      return data.invite_link.trim();
    }

    return null;
  } catch (error) {
    return null;
  }
}

function applyModelConfig(language) {
  document.documentElement.lang = language;

  const modelName = document.getElementById("model-name");
  const tagline = document.getElementById("tagline");
  const labelOf = document.getElementById("label-of");
  const labelTg = document.getElementById("label-tg");
  const footerText = document.getElementById("footer-text");
  const btnOf = document.getElementById("btn-of");
  const btnTg = document.getElementById("btn-tg");
  const heroImage = document.getElementById("hero-image");

  const translations = i18n[language] || i18n.es;

  modelName.textContent = MODEL_CONFIG.nombre;
  tagline.textContent = (MODEL_CONFIG.tagline && MODEL_CONFIG.tagline[language]) || MODEL_CONFIG.tagline.es;
  labelOf.textContent = translations.btn_of;
  labelTg.textContent = translations.btn_tg;
  footerText.textContent = translations.footer;

  btnOf.href = MODEL_CONFIG.links.onlyfans;
  btnTg.href = MODEL_CONFIG.links.telegram;

  if (MODEL_CONFIG.colores && MODEL_CONFIG.colores.accent) {
    document.documentElement.style.setProperty("--accent", MODEL_CONFIG.colores.accent);
  }

  if (MODEL_CONFIG.foto) {
    heroImage.src = MODEL_CONFIG.foto;
  }

  document.title = MODEL_CONFIG.nombre;
  document.getElementById("year").textContent = new Date().getFullYear().toString();
}

function buildTrackingPayload(buttonName, language, utmSource, visitorId, fingerprintHash) {
  return {
    request_id: uuidv4(),
    visitor_id: visitorId,
    fingerprint_hash: fingerprintHash,
    utm_source: utmSource,
    idioma: language,
    dispositivo: detectDevice(),
    user_agent: navigator.userAgent,
    ip_hash: null,
    boton_clickado: buttonName,
    modelo_id: MODELO_ID,
    timestamp: new Date().toISOString()
  };
}

async function trackAndRedirect(destination, buttonName, language, utmSource, visitorId, fingerprintHash) {
  if (hasNavigated) {
    return;
  }

  hasNavigated = true;

  try {
    const payload = buildTrackingPayload(buttonName, language, utmSource, visitorId, fingerprintHash);

    const sent = await postTrack(payload, true);
    if (!sent) {
      enqueuePendingEvent(payload);
    }
  } catch (error) {
    const payload = buildTrackingPayload(buttonName, language, utmSource, visitorId, fingerprintHash);
    enqueuePendingEvent(payload);
  } finally {
    window.location.href = destination;
  }
}

function bindTracking(language, utmSource, visitorId, fingerprintHash) {
  const linkButtons = [
    { element: document.getElementById("btn-of"), name: "onlyfans" },
    { element: document.getElementById("btn-tg"), name: "telegram" }
  ];

  for (const item of linkButtons) {
    if (!item.element) {
      continue;
    }

    item.element.addEventListener("click", (event) => {
      event.preventDefault();
      const destination = item.element.getAttribute("href") || "#";
      trackAndRedirect(destination, item.name, language, utmSource, visitorId, fingerprintHash);
    });
  }
}

function bindManualLanguageControls() {
  const selectors = ["[data-lang]", "#btn-lang-es", "#btn-lang-en"];
  const elementMap = new Map();

  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      if (!elementMap.has(element)) {
        elementMap.set(element, true);
      }
    }
  }

  for (const element of elementMap.keys()) {
    element.addEventListener("click", (event) => {
      const attrLang = normalizeLanguage(element.getAttribute("data-lang"));
      const idLang = element.id === "btn-lang-es" ? "es" : element.id === "btn-lang-en" ? "en" : null;
      const selectedLang = attrLang || idLang;

      if (!selectedLang) {
        return;
      }

      event.preventDefault();
      storageSet("lang_manual", selectedLang);
      storageSet("lang", selectedLang);
      setCookie("lang", selectedLang, VISITOR_COOKIE_DAYS);
      applyModelConfig(selectedLang);
    });
  }
}

async function init() {
  try {
    initCrossTabSync();
    flushPendingEvents();
    bindManualLanguageControls();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flushPendingEventsOnHidden();
      }
    });

    window.addEventListener("pagehide", () => {
      flushPendingEventsOnHidden();
    });

    const utmSource = resolveUtmSource();
    const language = detectLanguage();

    storageSet("lang", language);
    setCookie("lang", language, VISITOR_COOKIE_DAYS);

    applyModelConfig(language);
    const identity = await resolveVisitorIdentity();
    broadcastVisitorId(identity.visitorId);

    setTelegramButtonLoading(true);
    const inviteLink = await fetchTelegramInviteLink(identity.visitorId);
    buildLinks(identity.visitorId, inviteLink);
    setTelegramButtonLoading(false);

    bindTracking(language, utmSource, identity.visitorId, identity.fingerprintHash);
  } catch (error) {
    const fallbackLanguage = detectLanguage();
    applyModelConfig(fallbackLanguage);
    const fallbackVisitorId = getExistingVisitorId() || uuidv4();
    persistVisitorId(fallbackVisitorId);
    broadcastVisitorId(fallbackVisitorId);
    setTelegramButtonLoading(false);
    buildLinks(fallbackVisitorId);
    bindTracking(fallbackLanguage, resolveUtmSource(), fallbackVisitorId, "sha256-unavailable");
  }
}

init();
