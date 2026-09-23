'use strict';

const crypto = require('crypto');
const logger = require('../utils/logger');
const { timedFetch } = require('../utils/smartFetch');
const { CLIENT_ORIGIN, isProd } = require('../config/env');

// Google's token endpoints answer in well under a second; a hung connection
// here used to stall the OAuth callback with no bound at all.
const GOOGLE_HTTP_TIMEOUT_MS = 20000;

// Shared Google OAuth 2.0 helpers, used by both /api/ga4 (Analytics) and
// /api/gsc (Search Console). One admin-configured OAuth client powers both
// apps — we just request a different scope set per flow and register a
// per-app redirect URI in Google Cloud Console.

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function buildAuthorizeUrl({ clientId, redirectUri, state, scopes }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await timedFetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Token exchange failed: ${data.error_description || data.error || res.statusText}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
    scope: data.scope || '',
  };
}

async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await timedFetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error || res.statusText}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
  };
}

async function fetchUserInfo(accessToken) {
  const res = await timedFetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function revokeToken(token) {
  if (!token) return;
  try {
    await timedFetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      timeout: GOOGLE_HTTP_TIMEOUT_MS,
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Google token revoke failed (best-effort)');
  }
}

// ---- Public origin --------------------------------------------------------
//
// The redirect URI handed to Google and the URL the browser is sent back to
// were both assembled from X-Forwarded-Host / Host on the incoming request.
// In production CLIENT_ORIGIN is mandatory and *is* the public origin, so use
// it and stop trusting request headers for a value that ends up in a redirect.
// Development keeps header derivation so a local setup keeps working
// unchanged whatever it has registered in Google Cloud Console.
function publicOrigin(req) {
  if (isProd) {
    const configured = String(CLIENT_ORIGIN || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)[0];
    if (configured) return configured.replace(/\/+$/, '');
  }
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

// ---- OAuth state ↔ browser binding ----------------------------------------
//
// The signed `state` proves which user *started* the flow. On its own that is
// not enough: an attacker can start a flow, take the Google URL (which carries
// a state for the attacker's uid), and get a victim to open it. The victim
// consents, Google sends the victim's browser to our callback with the
// attacker's state, and the victim's Google tokens are saved under the
// attacker's account. A nonce cookie set when the flow starts, and required to
// match the state at the callback, binds the state to the browser that began
// it. SameSite=Lax cookies are sent on the top-level GET Google performs, and
// an attacker cannot plant one in the victim's browser for our origin.
const STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

function readCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function isSecureRequest(req) {
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https';
}

function setStateCookie(req, res, name, nonce, path) {
  res.cookie(name, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path,
    maxAge: STATE_COOKIE_MAX_AGE_MS,
  });
}

function clearStateCookie(req, res, name, path) {
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: isSecureRequest(req), path });
}

/** Constant-time equality for the nonce in the cookie vs the one in the state. */
function nonceMatches(fromCookie, fromState) {
  if (typeof fromCookie !== 'string' || typeof fromState !== 'string') return false;
  const a = Buffer.from(fromCookie);
  const b = Buffer.from(fromState);
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  publicOrigin,
  readCookie,
  setStateCookie,
  clearStateCookie,
  nonceMatches,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchUserInfo,
  revokeToken,
};
