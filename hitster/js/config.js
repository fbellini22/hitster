export const CONFIG = {
  // ✅ Metti SOLO il Client ID (ok in client-side)
  CLIENT_ID: "1031669a52cf4742b6e908a536a247e5",

  // ✅ Deve combaciare ESATTAMENTE con quello impostato nella Spotify Developer Dashboard
  // Esempi:
  // - "http://localhost:5173/" (se usi un dev server)
  // - "http://localhost:8080/" (python -m http.server)
  // - "https://tuosito.netlify.app/"
  REDIRECT_URI: window.location.origin + window.location.pathname,

  AUTH_ENDPOINT: "https://accounts.spotify.com/authorize",
  TOKEN_ENDPOINT: "https://accounts.spotify.com/api/token",
  API_BASE: "https://api.spotify.com/v1",

  // Scopes minimi + utili per playback + stato
  // Nota: Spotify richiede Premium per playback/transfer e Web Playback SDK. :contentReference[oaicite:7]{index=7}
  SCOPES: [
    "streaming",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing"
  ],

  PLAY_WINDOW_MS: 30_000,      // 30s di gioco
  QR_DEBOUNCE_MS: 1500,        // anti doppia scansione
  TRANSFER_RETRY: 2,           // retry transfer playback
};