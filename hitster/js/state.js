export const STATES = {
  logged_out: "logged_out",
  logging_in: "logging_in",
  ready: "ready",
  scanning: "scanning",
  playing: "playing",
  reveal: "reveal",
  error: "error",
};

let state = STATES.logged_out;

const ui = {
  badge: () => document.getElementById("stateBadge"),
  panel: () => document.getElementById("panel"),
};

function badgeText(s) {
  switch (s) {
    case STATES.logged_out: return "LOGGED OUT";
    case STATES.logging_in: return "LOGGING IN";
    case STATES.ready: return "READY";
    case STATES.scanning: return "SCANNING";
    case STATES.playing: return "PLAYING";
    case STATES.reveal: return "REVEAL";
    case STATES.error: return "ERROR";
    default: return String(s).toUpperCase();
  }
}

export function getState() {
  return state;
}

export function setState(next, payload = {}) {
  state = next;
  render(payload);
}

export function render(payload = {}) {
  if (ui.badge()) ui.badge().textContent = badgeText(state);

  const panel = ui.panel();
  if (!panel) return;

  if (state === STATES.logged_out) {
    panel.innerHTML = `
      <h1 class="h1">Login Spotify</h1>
      <p class="p">Il telefono diventa il player. Premi Login e autorizza.</p>
      <div class="hr"></div>
      <button id="loginBtn" class="btn primary">LOGIN</button>
      <div class="small">Richiede Spotify Premium + permessi playback.</div>
    `;
    return;
  }

  if (state === STATES.logging_in) {
    panel.innerHTML = `
      <h1 class="h1">Collegamento…</h1>
      <p class="p">Sto inizializzando Spotify Web Playback SDK e preparando il device.</p>
      <div class="hr"></div>
      <button class="btn" disabled>ATTENDI…</button>
      <div class="kv"><div class="k">Device</div><div class="v">${payload.deviceId ? "OK" : "—"}</div></div>
    `;
    return;
  }

  if (state === STATES.ready) {
    panel.innerHTML = `
      <h1 class="h1">Pronto</h1>
      <p class="p">Premi SCAN e inquadra una carta QR Spotify.</p>
      <div class="hr"></div>
      <button id="scanBtn" class="btn primary">SCAN</button>
      <div class="row">
        <button id="logoutBtn" class="btn danger">LOGOUT</button>
      </div>
      <div class="kv"><div class="k">Device</div><div class="v">${payload.deviceId ? "Browser Player" : "—"}</div></div>
    `;
    return;
  }

  if (state === STATES.scanning) {
    panel.innerHTML = `
      <h1 class="h1">Scansione</h1>
      <p class="p" id="scanHint">Inquadra il QR…</p>
      <div id="qrRegion"></div>
      <div class="row">
        <button id="stopScanBtn" class="btn">ANNULLA</button>
      </div>
      <div class="small">Suggerimento: usa QR con open.spotify.com/track/&lt;id&gt; o spotify:track:&lt;id&gt;.</div>
    `;
    return;
  }

  if (state === STATES.playing) {
    panel.innerHTML = `
      <h1 class="h1">In riproduzione</h1>
      <p class="p">Ascolta e indovina. Reveal tra poco…</p>
      <div class="timerWrap">
        <div class="timerNum" id="timerNum">30</div>
        <div class="progress"><div id="timerBar"></div></div>
      </div>
      <div class="row">
        <button id="stopBtn" class="btn danger">STOP</button>
      </div>
      <div class="kv"><div class="k">Track</div><div class="v">${payload.trackLabel || "—"}</div></div>
    `;
    return;
  }

  if (state === STATES.reveal) {
    panel.innerHTML = `
      <h1 class="h1">Reveal</h1>
      <p class="p">Ecco la canzone della carta.</p>
      <div id="revealCard" class="revealCard">
        <div class="trackTitle">${payload.title || "—"}</div>
        <div class="trackArtist">${payload.artist || "—"}</div>
      </div>
      <div class="hr"></div>
      <button id="nextBtn" class="btn primary">NEXT</button>
    `;
    // trigger animazione
    requestAnimationFrame(() => {
      const el = document.getElementById("revealCard");
      el?.classList.add("show");
    });
    return;
  }

  if (state === STATES.error) {
    panel.innerHTML = `
      <h1 class="h1">Errore</h1>
      <p class="p">${payload.message || "Qualcosa è andato storto."}</p>
      <div class="hr"></div>
      <button id="toReadyBtn" class="btn primary">TORNA</button>
    `;
  }
}