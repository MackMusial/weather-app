# Weather + Calendar

A Progressive Web App that lays your day out as a single hour-by-hour table:

| Time | Weather that hour | Google Calendar events that hour |
|------|-------------------|----------------------------------|
| 9 AM | ☀️ 18°C Clear     | Standup 9:00–9:15                |
| 10 AM | ⛅ 20°C Partly cloudy | —                          |

Built for **403 Mobile App Dev**. Vanilla HTML/CSS/JS — no build step, no framework.

**Live:** https://mackmusial.github.io/weather-app/

## Features

- **Hourly weather** from [Open-Meteo](https://open-meteo.com/) — free, no API key. Temperature, WMO condition (with icon), and precipitation chance for all 24 hours.
- **Google Calendar** integration (read-only OAuth) — timed events are placed in every hour they overlap; all-day events show as chips in the header.
- **City search** (Open-Meteo geocoding) or **device geolocation** for the weather location.
- **Day navigation** — today through +6 days (the forecast horizon).
- Current hour is highlighted and scrolled into view; past hours are dimmed.
- **Installable PWA** — service worker precaches the app shell; installable to a phone home screen. Assumes internet connectivity for all data.

## Tech

| Concern | Choice |
|---------|--------|
| Weather API | Open-Meteo REST (`/v1/forecast`, `/v1/search`) — keyless |
| Calendar API | Google Calendar API v3 |
| Auth | Google Identity Services (GIS) token client, `calendar.readonly` scope |
| Hosting | GitHub Pages (static) |
| PWA | `manifest.webmanifest` + `sw.js` (app-shell cache) |

## Run locally

Must be served over `http(s)` — not opened as a `file://` — for the service worker and Google OAuth to work.

```sh
python -m http.server 8000
# open http://localhost:8000
```

`localhost` counts as a secure context, so everything works there without HTTPS.

## Google Calendar setup (one time)

The weather half works with no setup. To enable the calendar column:

1. <https://console.cloud.google.com/> → create a project.
2. **APIs & Services → Library →** enable **Google Calendar API**.
3. **OAuth consent screen:** User type *External*; fill the required fields; under **Test users** add your own Google address.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Under **Authorized JavaScript origins** add every origin you open the app from:
   - `http://localhost:8000`
   - `https://mackmusial.github.io`
5. Put the client ID in [`config.js`](config.js):

   ```js
   window.WEATHER_APP_CONFIG = {
     GOOGLE_CLIENT_ID: "xxxxxxxx.apps.googleusercontent.com",
     DEFAULT_LOCATION: { name: "Toronto", latitude: 43.6532, longitude: -79.3832 },
   };
   ```

Reload, click **Connect Google Calendar**, approve the read-only scope. The access
token lives in `sessionStorage` only and is gone when the tab closes.

> `config.js` holds only an OAuth **client ID**, which is public by design (it is
> sent to the browser on every load). There is no secret in this repo.

## Deploy

Any static host works. This repo is set up for GitHub Pages — pushing to `main`
publishes `/` at the URL above. After deploying, add the Pages origin to the
Google OAuth client's authorized origins (step 4).

## Project layout

| File | Purpose |
|------|---------|
| `index.html` | Header controls + 3-column grid |
| `styles.css` | Mobile-first dark theme |
| `app.js` | Weather fetch, Google auth, calendar fetch, rendering |
| `config.js` | Google client ID + default location |
| `manifest.webmanifest` | PWA metadata |
| `sw.js` | Service worker (app-shell precache) |
| `gen-icons.js` | Regenerates `icons/` — `node gen-icons.js` |
