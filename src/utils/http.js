'use strict';

/**
 * Resolve the originating client IP. Reads `x-forwarded-for` first (proxy/CDN
 * forwarded), falls back to the connection's remote address with IPv4-mapped
 * IPv6 prefix stripped.
 */
function resolveClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  const raw = req.connection?.remoteAddress || req.socket?.remoteAddress || '';
  return raw.replace(/^::ffff:/, '');
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

module.exports = { resolveClientIp, maskApiKey };
