import { CONFIG } from "./config.js";
import { login, clearAuth, isLoggedIn, handleAuthCallbackIfPresent } from "./auth.js";
import { initSpotifyPlayer, isSdkReady, getDeviceId, ensureBrowserIsActiveDevice, getTrackInfo, playTrackAtPosition, pausePlayback } from "./spotify.js";
import { startQrScan, stopQrScan } from "./qr.js";
import { STATES, setState, getState } from "./state.js";

const errorModal = {
  root: () => document.getElementById("errorModal"),
  text: () => document.getElementById("errorText"),
  close: () => document.getElementById("closeErrorBtn"),
  retry: () => document.getElementById("retryBtn"),
};

let playbackLock = false;
let scanLock = false;

let countdownTimer = null;
let countdownT0 = 0;
let countdownDur = CONFIG.PLAY_WINDOW_MS;

let currentTrack = null; // { trackId, uri, title, artist, durationMs, offsetMs, playMs }

function showError(message, retryFn = null) {
  const root = errorModal.root();
  if (!root) return alert(message);

  errorModal.text().textContent = message;
  root.classList.remove("hidden");

  const closeModal = () => root.classList.add("hidden");

  errorModal.close().onclick = () => closeModal();
  errorModal.retry().onclick = async () => {
    closeModal();
    if (retryFn) await retryFn();
  };
}

async function safePauseAndCleanup() {
  // stop scanning
  try { await stopQrScan(); } catch (_) {}

  // stop countdown
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  // pause playback
  try { await pausePlayback(); } catch (_) {}
  playbackLock = false;
}

function bindUiHandlers() {
  const s = getState();

  if (s === STATES.logged_out) {
    document.getElementById("loginBtn")?.addEventListener("click", async () => {
      try {
        setState(STATES.logging_in, { deviceId: null });
        await login(); // redirect
      } catch (e) {
        setState(STATES.logged_out);
        showError(e.message);
      }
    });
    return;
  }

  if (s === STATES.ready) {
    document.getElementById("scanBtn")?.addEventListener("click", async () => {
      await goScanning();
    });

    document.getElementById("logoutBtn")?.addEventListener("click", async () => {
      await safePauseAndCleanup();
      clearAuth();
      setState(STATES.logged_out);
      bindUiHandlers();
    });

    return;
  }

  if (s === STATES.scanning) {
    document.getElementById("stopScanBtn")?.addEventListener("click", async () => {
      scanLock = false;
      await stopQrScan();
      setState(STATES.ready, { deviceId: getDeviceId() });
      bindUiHandlers();
    });
    return;
  }

  if (s === STATES.playing) {
    document.getElementById("stopBtn")?.addEventListener("click", async () => {
      await safePauseAndCleanup();
      setState(STATES.ready, { deviceId: getDeviceId() });
      bindUiHandlers();
    });
    return;
  }

  if (s === STATES.reveal) {
    document.getElementById("nextBtn")?.addEventListener("click", async () => {
      currentTrack = null;
      setState(STATES.ready, { deviceId: getDeviceId() });
      bindUiHandlers();
    });
    return;
  }

  if (s === STATES.error) {
    document.getElementById("toReadyBtn")?.addEventListener("click", async () => {
      setState(isLoggedIn() ? STATES.ready : STATES.logged_out, { deviceId: getDeviceId() });
      bindUiHandlers();
    });
  }
}

async function ensureSpotifyReady() {
  setState(STATES.logging_in, { deviceId: getDeviceId() });

  // Init SDK se non pronto
  if (!isSdkReady()) {
    await initSpotifyPlayer({
      onStatus: (ev) => {
        if (ev.type === "ready") setState(STATES.logging_in, { deviceId: ev.deviceId });
        if (ev.type === "error") showError(ev.message);
      },
    });
  }

  // Transfer playback sul browser device
  await ensureBrowserIsActiveDevice();
}

async function goReady() {
  await ensureSpotifyReady();
  setState(STATES.ready, { deviceId: getDeviceId() });
  bindUiHandlers();
}

async function goScanning() {
  if (scanLock) return;
  scanLock = true;

  // Non lasciare nulla in riproduzione
  await safePauseAndCleanup();

  setState(STATES.scanning, { deviceId: getDeviceId() });
  bindUiHandlers();

  await startQrScan({
    regionId: "qrRegion",
    onStatus: (msg) => {
      const hint = document.getElementById("scanHint");
      if (hint) hint.textContent = msg;
    },
    onError: (msg) => showError(msg),
    onTrackId: async (trackId) => {
      if (playbackLock) return; // single playback lock
      if (!scanLock) return;

      // blocca ulteriori scansioni mentre prepari play
      scanLock = false;

      try {
        await stopQrScan();
      } catch (_) {}

      try {
        await startGameForTrack(trackId);
      } catch (e) {
        await safePauseAndCleanup();
        setState(STATES.ready, { deviceId: getDeviceId() });
        bindUiHandlers();
        showError(e.message);
      }
    },
  });
}

function pickRandomOffset(durationMs) {
  const windowMs = CONFIG.PLAY_WINDOW_MS;
  if (!durationMs || durationMs <= 0) return { offsetMs: 0, playMs: windowMs };

  if (durationMs <= windowMs) {
    return { offsetMs: 0, playMs: Math.min(windowMs, durationMs) };
  }

  const maxOffset = durationMs - windowMs;
  const offsetMs = Math.floor(Math.random() * (maxOffset + 1)); // inclusive
  return { offsetMs, playMs: windowMs };
}

function startCountdown(playMs) {
  countdownDur = playMs;
  countdownT0 = performance.now();

  const numEl = document.getElementById("timerNum");
  const barEl = document.getElementById("timerBar");

  const tick = () => {
    const t = performance.now();
    const elapsed = t - countdownT0;
    const remaining = Math.max(0, countdownDur - elapsed);

    const sec = Math.ceil(remaining / 1000);
    if (numEl) numEl.textContent = String(sec);

    const pct = Math.min(100, (elapsed / countdownDur) * 100);
    if (barEl) barEl.style.width = `${pct}%`;

    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  tick();
  countdownTimer = setInterval(tick, 80);
}

async function startGameForTrack(trackId) {
  playbackLock = true;

  // Assicura device attivo (se nel frattempo è cambiato)
  await ensureBrowserIsActiveDevice();

  // Track info
  const info = await getTrackInfo(trackId);

  // Random offset valido:
  // 0 <= offset <= duration - 30000, se duration < 30s offset=0 e playMs=min(30s, duration)
  const { offsetMs, playMs } = pickRandomOffset(info.durationMs);

  currentTrack = {
    trackId,
    uri: info.uri,
    title: info.title,
    artist: info.artist,
    durationMs: info.durationMs,
    offsetMs,
    playMs,
  };

  setState(STATES.playing, {
    deviceId: getDeviceId(),
    trackLabel: `${info.title} — ${info.artist}`.slice(0, 32) + ((`${info.title} — ${info.artist}`).length > 32 ? "…" : ""),
  });
  bindUiHandlers();

  // Start playback at random position
  await playTrackAtPosition({ trackUri: info.uri, positionMs: offsetMs });

  // Countdown + stop EXACT
  startCountdown(playMs);

  // Stop esatto con setTimeout (più preciso della sola UI)
  setTimeout(async () => {
    // se nel frattempo hai già stoppato o cambiato stato, ignora
    if (!currentTrack || getState() !== STATES.playing) return;

    try {
      await pausePlayback();
    } catch (e) {
      // non bloccare il reveal se pause fallisce
    } finally {
      playbackLock = false;
      setState(STATES.reveal, { title: info.title, artist: info.artist });
      bindUiHandlers();
    }
  }, playMs);
}

async function boot() {
  // 1) chiudi modal error
  document.getElementById("closeErrorBtn")?.addEventListener("click", () => {
    errorModal.root()?.classList.add("hidden");
  });

  // 2) gestisci callback OAuth (se presente ?code=)
  const cb = await handleAuthCallbackIfPresent();
  if (!cb.ok) {
    setState(STATES.logged_out);
    bindUiHandlers();
    showError(cb.error);
    return;
  }

  // 3) se non loggato
  if (!isLoggedIn()) {
    setState(STATES.logged_out);
    bindUiHandlers();
    return;
  }

  // 4) loggato → init player + transfer → ready
  try {
    await goReady();
  } catch (e) {
    setState(STATES.logged_out);
    bindUiHandlers();
    showError(e.message, async () => {
      // retry init
      await boot();
    });
  }
}

boot();

// Cleanup quando tab va in background (opzionale ma utile su mobile)
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) {
    // evita audio che continua se qualcuno locka lo schermo
    try { await pausePlayback(); } catch (_) {}
  }
});