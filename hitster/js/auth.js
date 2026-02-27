import { CONFIG } from "./config.js";

const LS = {
  accessToken: "hitster_access_token",
  refreshToken: "hitster_refresh_token",
  expiresAt: "hitster_expires_at",
  verifier: "hitster_pkce_verifier",
};

function base64UrlEncode(bytes) {
  let str = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return await crypto.subtle.digest("SHA-256", data);
}

function randomString(len = 64) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
}

export async function createPkcePair() {
  const verifier = randomString(64);
  const hashed = await sha256(verifier);
  const challenge = base64UrlEncode(hashed);
  localStorage.setItem(LS.verifier, verifier);
  return { verifier, challenge };
}

export function isLoggedIn() {
  const token = localStorage.getItem(LS.accessToken);
  const exp = Number(localStorage.getItem(LS.expiresAt) || "0");
  return !!token && Date.now() < exp - 10_000; // 10s buffer
}

export function getAccessToken() {
  return localStorage.getItem(LS.accessToken);
}

export async function ensureValidToken() {
  const token = localStorage.getItem(LS.accessToken);
  const exp = Number(localStorage.getItem(LS.expiresAt) || "0");
  if (token && Date.now() < exp - 10_000) return token;

  const refresh = localStorage.getItem(LS.refreshToken);
  if (!refresh) return null;

  // Refresh token (PKCE) client-side: Spotify ha un tutorial che mostra anche l’esempio browser. :contentReference[oaicite:8]{index=8}
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: CONFIG.CLIENT_ID,
  });

  const res = await fetch(CONFIG.TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    // token non rinnovabile → logout soft
    clearAuth();
    return null;
  }

  const data = await res.json();
  const expiresAt = Date.now() + (data.expires_in * 1000);

  localStorage.setItem(LS.accessToken, data.access_token);
  localStorage.setItem(LS.expiresAt, String(expiresAt));
  if (data.refresh_token) localStorage.setItem(LS.refreshToken, data.refresh_token);

  return data.access_token;
}

export function clearAuth() {
  localStorage.removeItem(LS.accessToken);
  localStorage.removeItem(LS.refreshToken);
  localStorage.removeItem(LS.expiresAt);
  localStorage.removeItem(LS.verifier);
}

export async function login() {
  const { challenge } = await createPkcePair();
  const params = new URLSearchParams({
    client_id: CONFIG.CLIENT_ID,
    response_type: "code",
    redirect_uri: CONFIG.REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: CONFIG.SCOPES.join(" "),
  });

  window.location.assign(`${CONFIG.AUTH_ENDPOINT}?${params.toString()}`);
}

export async function handleAuthCallbackIfPresent() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) {
    return { ok: false, error: `Login Spotify fallito: ${error}` };
  }
  if (!code) return { ok: true, handled: false };

  const verifier = localStorage.getItem(LS.verifier);
  if (!verifier) return { ok: false, error: "PKCE verifier mancante (storage pulito?). Riprova login." };

  const body = new URLSearchParams({
    client_id: CONFIG.CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: CONFIG.REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch(CONFIG.TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, error: `Token exchange fallito: ${txt}` };
  }

  const data = await res.json();
  const expiresAt = Date.now() + (data.expires_in * 1000);

  localStorage.setItem(LS.accessToken, data.access_token);
  localStorage.setItem(LS.expiresAt, String(expiresAt));
  if (data.refresh_token) localStorage.setItem(LS.refreshToken, data.refresh_token);

  // pulisci querystring (?code=)
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, document.title, url.toString());

  return { ok: true, handled: true };
}