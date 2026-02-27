import { CONFIG } from "./config.js";
import { ensureValidToken } from "./auth.js";

let player = null;
let deviceId = null;
let sdkReady = false;

function friendlyApiError(status, text) {
  if (status === 401) return "Sessione scaduta. Rifai login.";
  if (status === 403) return "Permessi insufficienti o account non Premium.";
  if (status === 404) return "Player non disponibile. Apri Spotify una volta o ritenta transfer playback.";
  return `Errore Spotify (${status}): ${text}`;
}

async function api(path, { method = "GET", query = null, body = null } = {}) {
  const token = await ensureValidToken();
  if (!token) throw new Error("Non autenticato. Fai login.");

  const url = new URL(CONFIG.API_BASE + path);
  if (query) Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(friendlyApiError(res.status, txt));
  }

  if (res.status === 204) return null;
  return await res.json();
}

export function getDeviceId() {
  return deviceId;
}

export function isSdkReady() {
  return sdkReady && !!deviceId;
}

export async function initSpotifyPlayer({ onStatus } = {}) {
  const token = await ensureValidToken();
  if (!token) throw new Error("Non autenticato. Fai login.");

  // Aspetta che la SDK esponga window.Spotify
  await new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.Spotify) { clearInterval(iv); resolve(); }
      if (Date.now() - t0 > 8000) { clearInterval(iv); reject(new Error("Spotify SDK non caricata.")); }
    }, 50);
  });

  player = new window.Spotify.Player({
    name: "Hitster Web Player",
    getOAuthToken: async cb => {
      const t = await ensureValidToken();
      cb(t);
    },
    volume: 0.9,
  });

  player.addListener("ready", ({ device_id }) => {
    deviceId = device_id;
    sdkReady = true;
    onStatus?.({ type: "ready", deviceId });
  });

  player.addListener("not_ready", ({ device_id }) => {
    onStatus?.({ type: "not_ready", deviceId: device_id });
  });

  player.addListener("initialization_error", ({ message }) => onStatus?.({ type: "error", message }));
  player.addListener("authentication_error", ({ message }) => onStatus?.({ type: "error", message: "Auth error: " + message }));
  player.addListener("account_error", ({ message }) => onStatus?.({ type: "error", message: "Account error: " + message }));
  player.addListener("playback_error", ({ message }) => onStatus?.({ type: "error", message: "Playback error: " + message }));

  await player.connect();
  return player;
}

/**
 * Transfer playback sul device del browser.
 * Endpoint: PUT /v1/me/player :contentReference[oaicite:9]{index=9}
 */
export async function transferPlaybackToBrowser({ autoplay = false } = {}) {
  if (!deviceId) throw new Error("Device non pronto (deviceId nullo).");

  // Retry leggero: a volte se non c'è "device attivo" Spotify è capriccioso.
  let lastErr = null;
  for (let i = 0; i <= CONFIG.TRANSFER_RETRY; i++) {
    try {
      await api("/me/player", {
        method: "PUT",
        body: { device_ids: [deviceId], play: autoplay },
      });
      return true;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw lastErr || new Error("Transfer playback fallito.");
}

export async function getTrackInfo(trackId) {
  const data = await api(`/tracks/${trackId}`);
  const title = data?.name ?? "Sconosciuto";
  const artist = (data?.artists || []).map(a => a.name).join(", ") || "Sconosciuto";
  const durationMs = data?.duration_ms ?? 0;
  return { title, artist, durationMs, uri: data?.uri ?? `spotify:track:${trackId}` };
}

/**
 * Avvia riproduzione sul device del browser a position_ms random.
 * Endpoint play: PUT /v1/me/player/play?device_id=... (Player API).
 */
export async function playTrackAtPosition({ trackUri, positionMs }) {
  if (!deviceId) throw new Error("Device non pronto.");

  await api("/me/player/play", {
    method: "PUT",
    query: { device_id: deviceId },
    body: {
      uris: [trackUri],
      position_ms: Math.max(0, Math.floor(positionMs || 0)),
    },
  });
}

export async function pausePlayback() {
  // Prova prima SDK (più “locale”), fallback Web API
  if (player) {
    try { await player.pause(); return; } catch (_) {}
  }
  await api("/me/player/pause", { method: "PUT" });
}

export async function ensureBrowserIsActiveDevice() {
  if (!deviceId) throw new Error("Device non pronto.");
  await transferPlaybackToBrowser({ autoplay: false });
}

export async function disconnectPlayer() {
  if (player) {
    try { await player.disconnect(); } catch (_) {}
  }
  player = null;
  deviceId = null;
  sdkReady = false;
}