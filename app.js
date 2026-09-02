/* Weather + Calendar PWA
 * Column 1: hour of day
 * Column 2: hourly weather from Open-Meteo (free, no key)
 * Column 3: your Google Calendar events in that hour
 */
"use strict";

const CFG = window.WEATHER_APP_CONFIG || {};
const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const CAL_DISCOVERY = "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest";
const TOKEN_KEY = "wa_gcal_token";
const UNIT_KEY = "wa_unit";
const REFRESH_MS = 10 * 60 * 1000; // re-fetch weather + events every 10 min
const TICK_MS = 60 * 1000; // move the "now" line every minute

function loadUnit() {
  try {
    const u = localStorage.getItem(UNIT_KEY);
    if (u === "celsius" || u === "fahrenheit") return u;
  } catch (e) {}
  return "celsius";
}

const state = {
  location: CFG.DEFAULT_LOCATION || { name: "Toronto", latitude: 43.6532, longitude: -79.3832 },
  dayOffset: 0, // 0 = today, 1 = tomorrow, ...
  unit: loadUnit(), // "celsius" | "fahrenheit"
  weather: null, // { "YYYY-MM-DDTHH:00": {temp, code, precip} }
  events: [], // normalized calendar events for the selected day
  gcalReady: false, // GIS + gapi both loaded
  connected: false,
};

const els = {
  rows: document.getElementById("rows"),
  status: document.getElementById("status"),
  location: document.getElementById("location"),
  dateLabel: document.getElementById("date-label"),
  allday: document.getElementById("allday"),
  gcalBtn: document.getElementById("gcal-btn"),
  unitBtn: document.getElementById("unit-btn"),
  cityForm: document.getElementById("city-form"),
  cityInput: document.getElementById("city-input"),
  geoBtn: document.getElementById("geo-btn"),
  prevDay: document.getElementById("prev-day"),
  nextDay: document.getElementById("next-day"),
};

/* ---------- date helpers ---------- */

function selectedDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + state.dayOffset);
  return d;
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function hourKey(d, hour) {
  return `${ymd(d)}T${String(hour).padStart(2, "0")}:00`;
}

function fmtHour(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", hour12: true });
}

function fmtDayLabel() {
  if (state.dayOffset === 0) return "Today";
  if (state.dayOffset === 1) return "Tomorrow";
  return selectedDate().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function setStatus(msg) {
  els.status.textContent = msg || "";
}

/* ---------- weather (Open-Meteo) ---------- */

const WMO = {
  0: ["☀️", "Clear"],
  1: ["🌤️", "Mostly clear"],
  2: ["⛅", "Partly cloudy"],
  3: ["☁️", "Overcast"],
  45: ["🌫️", "Fog"],
  48: ["🌫️", "Rime fog"],
  51: ["🌦️", "Light drizzle"],
  53: ["🌦️", "Drizzle"],
  55: ["🌧️", "Heavy drizzle"],
  56: ["🌧️", "Freezing drizzle"],
  57: ["🌧️", "Freezing drizzle"],
  61: ["🌦️", "Light rain"],
  63: ["🌧️", "Rain"],
  65: ["🌧️", "Heavy rain"],
  66: ["🌧️", "Freezing rain"],
  67: ["🌧️", "Freezing rain"],
  71: ["🌨️", "Light snow"],
  73: ["🌨️", "Snow"],
  75: ["❄️", "Heavy snow"],
  77: ["🌨️", "Snow grains"],
  80: ["🌦️", "Rain showers"],
  81: ["🌧️", "Rain showers"],
  82: ["⛈️", "Violent showers"],
  85: ["🌨️", "Snow showers"],
  86: ["❄️", "Snow showers"],
  95: ["⛈️", "Thunderstorm"],
  96: ["⛈️", "Thunderstorm + hail"],
  99: ["⛈️", "Thunderstorm + hail"],
};

async function loadWeather() {
  const date = ymd(selectedDate());
  const { latitude, longitude } = state.location;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&hourly=temperature_2m,precipitation_probability,weather_code` +
    `&temperature_unit=${state.unit}` +
    `&timezone=auto&start_date=${date}&end_date=${date}`;

  setStatus(`Loading weather for ${state.location.name}…`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  const data = await res.json();

  const h = data.hourly;
  const map = {};
  h.time.forEach((iso, i) => {
    map[iso] = {
      temp: h.temperature_2m[i],
      code: h.weather_code[i],
      precip: h.precipitation_probability ? h.precipitation_probability[i] : null,
    };
  });
  state.weather = map;
  state.tempUnit = data.hourly_units?.temperature_2m || "°C";
  setStatus("");
}

async function searchCity(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=1`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.results || !data.results.length) throw new Error("City not found");
  const r = data.results[0];
  return {
    name: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
    latitude: r.latitude,
    longitude: r.longitude,
  };
}

/* ---------- Google Calendar ---------- */

let tokenClient = null;
let gapiInited = false;
let gisInited = false;

function onGapiLoad() {
  gapi.load("client", async () => {
    await gapi.client.init({ discoveryDocs: [CAL_DISCOVERY] });
    gapiInited = true;
    maybeReady();
  });
}

function onGisLoad() {
  if (!CFG.GOOGLE_CLIENT_ID || CFG.GOOGLE_CLIENT_ID.startsWith("PASTE_")) {
    els.gcalBtn.textContent = "Set Google Client ID";
    els.gcalBtn.disabled = true;
    setStatus("Add your OAuth client ID in config.js to enable calendar.");
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CFG.GOOGLE_CLIENT_ID,
    scope: CAL_SCOPE,
    callback: (resp) => {
      if (resp.error) {
        setStatus(`Google auth error: ${resp.error}`);
        return;
      }
      persistToken(resp);
      afterAuth();
    },
  });
  gisInited = true;
  maybeReady();
}

function maybeReady() {
  if (gapiInited && gisInited) {
    state.gcalReady = true;
    const saved = loadToken();
    if (saved) {
      gapi.client.setToken(saved);
      afterAuth();
    }
  }
}

function persistToken(resp) {
  const token = {
    access_token: resp.access_token,
    expires_at: Date.now() + (Number(resp.expires_in) || 3600) * 1000,
  };
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  } catch (e) {}
}

function loadToken() {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (t.expires_at && t.expires_at > Date.now() + 30000) return t;
    sessionStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
  return null;
}

function connectCalendar() {
  if (!state.gcalReady || !tokenClient) {
    setStatus("Google libraries still loading — try again in a moment.");
    return;
  }
  const prompt = gapi.client.getToken() ? "" : "consent";
  tokenClient.requestAccessToken({ prompt });
}

function disconnectCalendar() {
  const t = gapi.client.getToken();
  if (t) {
    google.accounts.oauth2.revoke(t.access_token, () => {});
    gapi.client.setToken(null);
  }
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch (e) {}
  state.connected = false;
  state.events = [];
  els.gcalBtn.textContent = "Connect Google Calendar";
  render();
}

async function afterAuth() {
  state.connected = true;
  els.gcalBtn.textContent = "Disconnect Calendar";
  await loadEvents();
  render();
}

async function loadEvents() {
  if (!state.connected) return;
  const day = selectedDate();
  const start = new Date(day);
  const end = new Date(day);
  end.setDate(end.getDate() + 1);

  try {
    const res = await gapi.client.calendar.events.list({
      calendarId: "primary",
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    });
    state.events = (res.result.items || []).map(normalizeEvent);
  } catch (err) {
    if (err?.status === 401) {
      disconnectCalendar();
      setStatus("Calendar session expired — reconnect.");
    } else {
      setStatus("Could not load calendar events.");
    }
    state.events = [];
  }
}

function normalizeEvent(ev) {
  const allDay = !!ev.start.date;
  const startsAt = allDay ? null : new Date(ev.start.dateTime);
  const endsAt = allDay ? null : new Date(ev.end.dateTime);
  return {
    title: ev.summary || "(no title)",
    location: ev.location || "",
    allDay,
    startsAt,
    endsAt,
  };
}

/* ---------- render ---------- */

function render({ scroll = false } = {}) {
  els.dateLabel.textContent = fmtDayLabel();
  els.location.textContent = state.location.name;
  els.unitBtn.textContent = state.unit === "celsius" ? "°F" : "°C";

  // all-day events
  const allDay = state.events.filter((e) => e.allDay);
  if (allDay.length) {
    els.allday.hidden = false;
    els.allday.innerHTML = allDay
      .map((e) => `<span class="chip">📌 ${escapeHtml(e.title)}</span>`)
      .join("");
  } else {
    els.allday.hidden = true;
    els.allday.innerHTML = "";
  }

  const now = new Date();
  const isToday = state.dayOffset === 0;
  const date = selectedDate();

  const timed = state.events.filter((e) => !e.allDay);

  const frag = document.createDocumentFragment();
  for (let hour = 0; hour < 24; hour++) {
    const li = document.createElement("li");
    li.className = "row";
    if (isToday && hour === now.getHours()) {
      li.classList.add("now");
      // horizontal line at the exact current minute within this hour row
      const line = document.createElement("div");
      line.className = "now-line";
      line.style.top = `${(now.getMinutes() / 60) * 100}%`;
      li.appendChild(line);
    } else if (isToday && hour < now.getHours()) {
      li.classList.add("past");
    }

    // time
    const time = document.createElement("div");
    time.className = "time";
    time.textContent = fmtHour(hour);
    li.appendChild(time);

    // weather
    const wx = document.createElement("div");
    wx.className = "wx";
    const w = state.weather ? state.weather[hourKey(date, hour)] : null;
    if (w) {
      const [icon, label] = WMO[w.code] || ["•", "—"];
      const precip =
        w.precip != null && w.precip > 0 ? ` · ${w.precip}%💧` : "";
      wx.innerHTML =
        `<span class="icon" title="${label}">${icon}</span>` +
        `<span class="temp">${Math.round(w.temp)}${state.tempUnit || "°"}</span>` +
        `<span class="meta">${label}${precip}</span>`;
    } else {
      wx.innerHTML = `<span class="empty">—</span>`;
    }
    li.appendChild(wx);

    // calendar
    const cal = document.createElement("div");
    cal.className = "events";
    const hits = timed.filter((e) => overlapsHour(e, date, hour));
    if (hits.length) {
      cal.innerHTML = hits
        .map(
          (e) =>
            `<div class="event"><div>${escapeHtml(e.title)}</div>` +
            `<div class="when">${fmtRange(e)}${
              e.location ? " · " + escapeHtml(e.location) : ""
            }</div></div>`
        )
        .join("");
    } else if (state.connected) {
      cal.innerHTML = `<span class="empty">—</span>`;
    } else {
      cal.innerHTML = `<span class="empty">connect calendar</span>`;
    }
    li.appendChild(cal);

    frag.appendChild(li);
  }

  els.rows.replaceChildren(frag);

  if (isToday && scroll) {
    const nowRow = els.rows.querySelector(".row.now");
    if (nowRow) nowRow.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function overlapsHour(ev, date, hour) {
  const slotStart = new Date(date);
  slotStart.setHours(hour, 0, 0, 0);
  const slotEnd = new Date(slotStart);
  slotEnd.setHours(hour + 1);
  return ev.startsAt < slotEnd && ev.endsAt > slotStart;
}

function fmtRange(ev) {
  const opt = { hour: "numeric", minute: "2-digit" };
  return `${ev.startsAt.toLocaleTimeString([], opt)}–${ev.endsAt.toLocaleTimeString([], opt)}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

/* ---------- refresh orchestration ---------- */

async function refresh() {
  render(); // paint the grid immediately
  try {
    await loadWeather();
  } catch (err) {
    setStatus(`Weather failed: ${err.message}`);
  }
  await loadEvents();
  render({ scroll: true });
}

/* ---------- events wiring ---------- */

els.gcalBtn.addEventListener("click", () => {
  if (state.connected) disconnectCalendar();
  else connectCalendar();
});

els.unitBtn.addEventListener("click", async () => {
  state.unit = state.unit === "celsius" ? "fahrenheit" : "celsius";
  try {
    localStorage.setItem(UNIT_KEY, state.unit);
  } catch (e) {}
  await refresh();
});

els.cityForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = els.cityInput.value.trim();
  if (!q) return;
  setStatus("Searching…");
  try {
    state.location = await searchCity(q);
    els.cityInput.value = "";
    await refresh();
  } catch (err) {
    setStatus(err.message);
  }
});

els.geoBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Geolocation not available.");
    return;
  }
  setStatus("Getting your location…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      state.location = {
        name: "My location",
        latitude: +pos.coords.latitude.toFixed(4),
        longitude: +pos.coords.longitude.toFixed(4),
      };
      await refresh();
    },
    (err) => setStatus(`Location denied: ${err.message}`),
    { enableHighAccuracy: false, timeout: 10000 }
  );
});

els.prevDay.addEventListener("click", async () => {
  if (state.dayOffset > 0) {
    state.dayOffset--;
    await refresh();
  }
});

els.nextDay.addEventListener("click", async () => {
  if (state.dayOffset < 6) {
    state.dayOffset++;
    await refresh();
  }
});

/* ---------- boot ---------- */

// Google libraries load async; poll until their globals exist.
const bootGoogle = setInterval(() => {
  if (window.gapi && !gapiInited) onGapiLoad();
  if (window.google?.accounts?.oauth2 && !gisInited) onGisLoad();
  if (gapiInited && gisInited) clearInterval(bootGoogle);
}, 200);
setTimeout(() => clearInterval(bootGoogle), 15000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// Keep data fresh and the "now" line moving while the tab stays open.
setInterval(refresh, REFRESH_MS);
setInterval(() => render(), TICK_MS);

refresh();
