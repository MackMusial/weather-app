// App configuration.
//
// Column 3 shows events from a PUBLIC Google Calendar, read with a Google API key
// (no OAuth, no sign-in). The calendar itself is chosen in the app's "Public
// calendar" box and remembered in localStorage — CALENDAR_ID below is only the
// default shown on first run (leave "" for no default).
//
// Getting the API key:
// 1. https://console.cloud.google.com/  → create/select a project.
// 2. APIs & Services → Library → enable "Google Calendar API".
// 3. APIs & Services → Credentials → Create credentials → API key. Copy it.
//    Recommended: Edit the key → restrict to the Calendar API, and add your
//    site origins under Website restrictions (localhost + your Pages URL).
window.WEATHER_APP_CONFIG = {
  GOOGLE_API_KEY: "AIzaSyASyRAsgV12d35AGHhfmxV4oGYn4dPWNFM",
  CALENDAR_ID: "gcorser@gmail.com", // default; the user can change it in the app

  // Default map location used before you grant geolocation or search a city.
  DEFAULT_LOCATION: { name: "Toronto", latitude: 43.6532, longitude: -79.3832 },
};
