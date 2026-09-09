/* Weather + Calendar PWA
 * Column 1: hour of day
 * Column 2: hourly weather from Open-Meteo (free, no key)
 * Column 3: events from a PUBLIC Google Calendar (read with an API key)
 */
"use strict";

const CFG = window.WEATHER_APP_CONFIG || {};
const CAL_API = "https://www.googleapis.com/calendar/v3/calendars";
const UNIT_KEY = "wa_unit";
const CAL_ID_KEY = "wa_calendar_id";
const CAL_HIST_KEY = "wa_calendar_history";
const REFRESH_MS = 10 * 60 * 1000; // re-fetch weather + events every 10 min
const TICK_MS = 60 * 1000; // move the "now" line every minute

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {}
}

function loadUnit() {
  const u = readLS(UNIT_KEY, "celsius");
  return u === "fahrenheit" ? "fahrenheit" : "celsius";
}

function loadCalHistory() {
  try {
    const arr = JSON.parse(readLS(CAL_HIST_KEY, "[]"));
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch (e) {
    return [];
  }
}

const state = {
  location: CFG.DEFAULT_LOCATION || { name: "Saginaw", latitude: 43.6532, longitude: -79.3832 },
  dayOffset: 0, // 0 = today, 1 = tomorrow, ...
  unit: loadUnit(), // "celsius" | "fahrenheit"
  // the public calendar to show — remembered choice, else the config default
  calendarId: readLS(CAL_ID_KEY, CFG.CALENDAR_ID || ""),
  calHistory: loadCalHistory(), // recently entered calendar IDs
  weather: null, // { "YYYY-MM-DDTHH:00": {temp, code, precip} }
  events: [], // normalized calendar events for the selected day
  calName: "", // display name of the calendar
  calError: "", // last calendar-load error, shown in the header
};

const els = {
  rows: document.getElementById("rows"),
  status: document.getElementById("status"),
  location: document.getElementById("location"),
  dateLabel: document.getElementById("date-label"),
  allday: document.getElementById("allday"),
  calName: document.getElementById("cal-name"),
  calForm: document.getElementById("cal-form"),
  calInput: document.getElementById("cal-input"),
  calHistory: document.getElementById("cal-history"),
  unitToggle: document.getElementById("unit-toggle"),
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
  if (els.status) els.status.textContent = msg || "";
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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let res;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "weather service timed out" : e.message);
  } finally {
    clearTimeout(timer);
  }

  // Open-Meteo sometimes returns a plain-text error with a 200, so parse defensively.
  const body = await res.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    throw new Error("weather service is temporarily unavailable");
  }
  if (!res.ok || data.error || !data.hourly) {
    throw new Error(data.reason || `weather service error (${res.status})`);
  }

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
  let data;
  try {
    data = JSON.parse(await res.text());
  } catch (e) {
    throw new Error("search is temporarily unavailable");
  }
  if (!res.ok) throw new Error(data.reason || `search error (${res.status})`);
  if (!data.results || !data.results.length) throw new Error("City not found");
  const r = data.results[0];
  return {
    name: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
    latitude: r.latitude,
    longitude: r.longitude,
  };
}

/* ---------- Google Calendar (public, API key) ---------- */

function apiKey() {
  const k = CFG.GOOGLE_API_KEY;
  return k && !k.startsWith("PASTE_") ? k : "";
}

function rememberCalendar(id) {
  state.calendarId = id;
  writeLS(CAL_ID_KEY, id);
  state.calHistory = [id, ...state.calHistory.filter((h) => h !== id)].slice(0, 6);
  writeLS(CAL_HIST_KEY, JSON.stringify(state.calHistory));
}

async function loadEvents() {
  if (!apiKey()) {
    state.events = [];
    state.calName = "";
    state.calError = "Add GOOGLE_API_KEY in config.js";
    return;
  }
  if (!state.calendarId) {
    state.events = [];
    state.calName = "";
    state.calError = "Enter a public calendar above";
    return;
  }

  const day = selectedDate();
  const start = new Date(day);
  const end = new Date(day);
  end.setDate(end.getDate() + 1);

  const url =
    `${CAL_API}/${encodeURIComponent(state.calendarId)}/events` +
    `?key=${encodeURIComponent(apiKey())}` +
    `&timeMin=${start.toISOString()}` +
    `&timeMax=${end.toISOString()}` +
    `&singleEvents=true&orderBy=startTime&maxResults=100`;

  try {
    const res = await fetch(url);
    let data;
    try {
      data = JSON.parse(await res.text());
    } catch (e) {
      throw new Error("calendar service is temporarily unavailable");
    }
    if (!res.ok) {
      if (res.status === 404) throw new Error("calendar not found or not public");
      throw new Error(data.error?.message || `Calendar API ${res.status}`);
    }
    state.events = (data.items || []).map(normalizeEvent);
    state.calName = data.summary || state.calendarId;
    state.calError = "";
  } catch (err) {
    state.events = [];
    state.calName = "";
    state.calError = `Calendar: ${err.message}`;
    console.warn("Calendar load failed:", err);
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
  els.unitToggle.dataset.unit = state.unit; // slides the thumb to the active side
  els.calName.textContent = state.calError || state.calName || "";

  // calendar input: reflect the loaded calendar (unless the user is typing)
  if (document.activeElement !== els.calInput) {
    els.calInput.value = state.calendarId;
  }
  els.calHistory.replaceChildren(
    ...state.calHistory.map((id) => {
      const o = document.createElement("option");
      o.value = id;
      return o;
    })
  );

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
    } else {
      cal.innerHTML = `<span class="empty">—</span>`;
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

let weatherRetry = null;
let refreshGen = 0;

async function refresh() {
  const gen = ++refreshGen; // so rapid nav/toggle clicks don't render out of order
  render(); // paint the grid immediately

  // Load both columns in parallel — a slow/broken weather API must not
  // hold up the calendar (loadEvents handles its own errors, never rejects).
  const [weather] = await Promise.allSettled([loadWeather(), loadEvents()]);
  if (gen !== refreshGen) return; // superseded by a newer refresh

  const weatherOk = weather.status === "fulfilled";
  if (!weatherOk) {
    setStatus(`Weather unavailable — ${weather.reason?.message || "error"}. Retrying…`);
  }

  render({ scroll: true });

  // On a weather failure, retry sooner than the normal 10-min cycle.
  clearTimeout(weatherRetry);
  if (!weatherOk) {
    weatherRetry = setTimeout(refresh, 90 * 1000);
  }
}

/* ---------- events wiring ---------- */

function wireEvents() {
  els.unitToggle.addEventListener("click", async (e) => {
    const opt = e.target.closest(".unit-opt");
    if (!opt || opt.dataset.unit === state.unit) return;
    state.unit = opt.dataset.unit;
    writeLS(UNIT_KEY, state.unit);
    await refresh();
  });

  els.calForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = els.calInput.value.trim();
    if (!id) return;
    rememberCalendar(id);
    els.calInput.blur();
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
}

/* ---------- boot ---------- */

const HEAL_FLAG = "wa_healed";

function boot() {
  // Self-heal: if a stale cached index.html doesn't match this script, the
  // elements it expects are missing. Wipe caches + SW and reload instead of
  // running half-broken — but only once per session, so a genuinely broken
  // deploy can't cause a reload loop.
  const missing = Object.entries(els)
    .filter(([, node]) => !node)
    .map(([key]) => key);
  if (missing.length) {
    console.error("Stale HTML/JS mismatch — missing elements:", missing);
    let alreadyHealed = false;
    try {
      alreadyHealed = sessionStorage.getItem(HEAL_FLAG) === "1";
      sessionStorage.setItem(HEAL_FLAG, "1");
    } catch (e) {}

    const msg = alreadyHealed
      ? "<h2>Update needed</h2><p>This page is out of date and couldn't refresh " +
        "itself. Hard-refresh with Ctrl+Shift+R, or clear the site's data.</p>"
      : "<h2>Updating…</h2><p>Loading the latest version…</p>";
    document.body.innerHTML =
      '<div style="padding:24px;font:16px/1.5 system-ui,sans-serif;color:#eef3ff;' +
      'background:#0b1b3a;min-height:100vh">' + msg + "</div>";

    if (alreadyHealed) return;

    Promise.all([
      navigator.serviceWorker
        ? navigator.serviceWorker
            .getRegistrations()
            .then((rs) => Promise.all(rs.map((r) => r.unregister())))
        : null,
      window.caches
        ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))
        : null,
    ]).finally(() => setTimeout(() => location.reload(), 1200));
    return;
  }

  try {
    sessionStorage.removeItem(HEAL_FLAG);
  } catch (e) {}

  wireEvents();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // Keep data fresh and the "now" line moving while the tab stays open.
  setInterval(refresh, REFRESH_MS);
  setInterval(() => render(), TICK_MS);

  refresh();
}

boot();
