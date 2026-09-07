'use strict';

const { TRUST_PROXY } = require('../config/env');
/**
 * Resolve the originating client IP. Reads `x-forwarded-for` first (proxy/CDN
 * forwarded), falls back to the connection's remote address with IPv4-mapped
 * IPv6 prefix stripped.
 */
/**
 * The client's address, honouring a reverse proxy only when one is configured.
 *
 * Forwarding headers are attacker-controlled unless something in front of the
 * app overwrites them, so they are read only when TRUST_PROXY says a proxy is
 * actually there. Without it we fall back to the socket address.
 *
 * CF-Connecting-IP is preferred over X-Forwarded-For behind Cloudflare:
 * Cloudflare sets it itself and ignores whatever the client sent, whereas
 * X-Forwarded-For is a chain the client can prepend to.
 */
function resolveClientIp(req) {
  const strip = (v) => String(v || '').trim().replace(/^::ffff:/, '');
  const trusted = Boolean(TRUST_PROXY && TRUST_PROXY.trim());

  if (trusted) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.trim()) return strip(cf);

    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return strip(forwarded.split(',')[0]);
    }
  }

  // Express resolves req.ip through the same trust-proxy setting, so it is
  // already correct in both cases; the raw socket is only a last resort.
  return strip(req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress);
}

/**
 * Mask the middle of a secret so the UI can show "did the admin set it?"
 * without leaking the full value.
 */
function maskApiKey(value = '') {
  if (!value) return '';
  if (value.length <= 8) return '•'.repeat(value.length);
  return `${value.slice(0, 4)}${'•'.repeat(value.length - 8)}${value.slice(-4)}`;
}

/**
 * Build an error for "the provider rejected the credential".
 *
 * With bring-your-own-key this is the single most likely failure, and it is
 * the user's to fix — so it must not surface as a generic 500. Tagged with a
 * status the route can pass straight through.
 */
function upstreamAuthError(provider) {
  const err = new Error(
    `${provider} rejected the API key. Check it in Settings -> API keys, or use Test to verify it.`,
  );
  err.status = 400;
  err.upstreamAuth = true;
  return err;
}

/** True when an upstream HTTP status means "bad credential". */
function isAuthStatus(status) {
  return status === 401 || status === 403;
}

module.exports = {
  upstreamAuthError,
  isAuthStatus, resolveClientIp, maskApiKey };
