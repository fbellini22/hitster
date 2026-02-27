import { CONFIG } from "./config.js";

let qr = null;
let scanning = false;
let lastScanAt = 0;
let lastPayload = null;

export function parseSpotifyTrackId(payload) {
  if (!payload || typeof payload !== "string") return null;

  // 1) spotify:track:<id>
  const m1 = payload.match(/spotify:track:([A-Za-z0-9]{22})/);
  if (m1) return m1[1];

  // 2) open.spotify.com/track/<id>
  const m2 = payload.match(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})/);
  if (m2) return m2[1];

  // 3) Play URL con query params
  const m3 = payload.match(/\/track\/([A-Za-z0-9]{22})\?/);
  if (m3) return m3[1];

  // spotify.link short url non risolvibile senza backend (serve redirect follow).
  if (payload.includes("spotify.link/")) return "SHORT_LINK_UNSUPPORTED";

  return null;
}

export function isScanning() {
  return scanning;
}

export async function startQrScan({ regionId = "qrRegion", onTrackId, onError, onStatus } = {}) {
  if (scanning) return;
  scanning = true;
  lastPayload = null;
  onStatus?.("Avvio fotocamera…");

  const regionEl = document.getElementById(regionId);
  if (!regionEl) throw new Error(`Elemento #${regionId} non trovato`);

  // Crea la UI container se manca (utile se il render lo ricrea)
  regionEl.innerHTML = "";

  qr = new Html5Qrcode(regionId);

  const config = {
    fps: 12,
    qrbox: { width: 260, height: 260 },
    rememberLastUsedCamera: true,
    aspectRatio: 1.0,
  };

  const onSuccess = (decodedText) => {
    const now = Date.now();
    if (now - lastScanAt < CONFIG.QR_DEBOUNCE_MS) return; // debounce
    if (decodedText && decodedText === lastPayload) return; // ignora ripetizione
    lastScanAt = now;
    lastPayload = decodedText;

    const trackId = parseSpotifyTrackId(decodedText);
    if (!trackId) {
      onError?.("QR non valido. Usa link tipo open.spotify.com/track/<id> o spotify:track:<id>.");
      return;
    }
    if (trackId === "SHORT_LINK_UNSUPPORTED") {
      onError?.("QR con spotify.link non supportato senza server. Genera QR con open.spotify.com/track/<id>.");
      return;
    }

    onTrackId?.(trackId);
  };

  const onFail = (_err) => {
    // silenzioso: html5-qrcode chiama spesso onFail durante scanning
  };

  try {
    await qr.start({ facingMode: "environment" }, config, onSuccess, onFail);
    onStatus?.("Inquadra il QR Spotify…");
  } catch (e) {
    scanning = false;
    onError?.("Impossibile avviare la camera. Concedi permessi e usa HTTPS.");
  }
}

export async function stopQrScan() {
  if (!qr) { scanning = false; return; }
  try {
    if (scanning) await qr.stop();
  } catch (_) {}
  try { await qr.clear(); } catch (_) {}
  qr = null;
  scanning = false;
}