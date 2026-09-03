# Weather + Calendar

A Progressive Web App that lays your day out as a single hour-by-hour table:

| Time | Weather that hour | Calendar events that hour |
|------|-------------------|---------------------------|
| 9 AM | ☀️ 18°C Clear     | Standup 9:00–9:15         |
| 10 AM | ⛅ 20°C Partly cloudy | —                    |

Built for **403 Mobile App Dev**. Vanilla HTML/CSS/JS — no build step, no framework.

**Live:** https://mackmusial.github.io/weather-app/

## Features

- **Hourly weather** from [Open-Meteo](https://open-meteo.com/) — free, no API key. Temperature, WMO condition (with icon), and precipitation chance for all 24 hours.
- **Public Google Calendar** — type any public calendar's email/ID into the header box (recent ones are remembered in a dropdown). Events are read with an API key, no sign-in, and placed in every hour they overlap; all-day events show as chips.
- **°C / °F toggle** — sliding switch in the header; the choice is saved to `localStorage`.
- **City search** (Open-Meteo geocoding) or **device geolocation** for the weather location.
- **Day navigation** — today through +6 days (the forecast horizon).
- **"Now" line** — a marker across the current hour's row at the exact minute; auto-refreshes weather + events every 10 min and advances the line every minute.
- Current hour is highlighted and scrolled into view; past hours are dimmed.
- **Installable PWA** — service worker precaches the app shell. Assumes internet connectivity for all data.

## Tech

| Concern | Choice |
|---------|--------|
| Weather API | Open-Meteo REST (`/v1/forecast`, `/v1/search`) — keyless |
| Calendar API | Google Calendar API v3 `events.list`, plain `fetch` with an API key |
| Hosting | GitHub Pages (static) |
| PWA | `manifest.webmanifest` + `sw.js` (app-shell cache) |

## Run locally

Must be served over `http(s)` — not opened as a `file://` — for the service worker.

```sh
python -m http.server 8000
# open http://localhost:8000
```

## Calendar setup (one time)

The weather half works with no setup. The calendar column needs a Google API key
and the ID of a **public** calendar — there is no OAuth and no sign-in.

1. <https://console.cloud.google.com/> → create/select a project.
2. **APIs & Services → Library →** enable **Google Calendar API**.
3. **APIs & Services → Credentials → Create credentials → API key.** Copy it.
   Recommended: **Edit** the key → restrict it to the **Google Calendar API**, and
   restrict it to your site's origins (`http://localhost:8000`,
   `https://mackmusial.github.io`).
4. In [`config.js`](config.js), set `GOOGLE_API_KEY` (and optionally a default
   `CALENDAR_ID`):

   ```js
   window.WEATHER_APP_CONFIG = {
     GOOGLE_API_KEY: "AIza...your-key...",
     CALENDAR_ID: "someone@gmail.com", // default only; changeable in the app
     DEFAULT_LOCATION: { name: "Toronto", latitude: 43.6532, longitude: -79.3832 },
   };
   ```

Reload. Type a public calendar's address into the **"Public calendar"** box in the
header and hit **Load** — its events fill column 3 and the calendar's name shows
next to the "Calendar" header. Your choice and recent entries are saved locally.

> The calendar's owner must have set it to **"Make available to public"** in Google
> Calendar's sharing settings. A restricted API key that can only read the Calendar
> API is safe to commit — there is no user data or secret involved.

## Deploy

Pushing to `main` publishes `/` to the URL above via GitHub Pages. Add the Pages
origin to the API key's allowed referrers (step 3).

## Project layout

| File | Purpose |
|------|---------|
| `index.html` | Header controls + 3-column grid |
| `styles.css` | Mobile-first dark theme |
| `app.js` | Weather fetch, calendar fetch, rendering |
| `config.js` | API key, calendar ID, default location |
| `manifest.webmanifest` | PWA metadata |
| `sw.js` | Service worker (app-shell precache) |
| `gen-icons.js` | Regenerates `icons/` — `node gen-icons.js` |
