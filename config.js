// App configuration.
// 1. Create a Google Cloud project → enable "Google Calendar API".
// 2. OAuth consent screen: External, add your Google account as a Test user.
// 3. Credentials → Create OAuth client ID → "Web application".
//    Authorized JavaScript origins: add every origin you open the app from, e.g.
//      http://localhost:8000
//      https://your-username.github.io   (if you deploy to GitHub Pages)
// 4. Paste the client ID below.
window.WEATHER_APP_CONFIG = {
  GOOGLE_CLIENT_ID: "PASTE_YOUR_OAUTH_CLIENT_ID_HERE.apps.googleusercontent.com",

  // Default map location used before you grant geolocation or search a city.
  DEFAULT_LOCATION: { name: "Toronto", latitude: 43.6532, longitude: -79.3832 },
};
