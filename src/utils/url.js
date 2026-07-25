'use strict';

/**
 * Normalize a user-supplied URL string. Adds `https://` if no scheme is
 * present, strips any hash, and returns the canonical string (or null if
 * unparseable).
 */
function normalizeUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  const prefixed = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const urlObj = new URL(prefixed);
    urlObj.hash = '';
    return urlObj.toString();
  } catch {
    return null;
  }
}

function formatHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeHostname(input) {
  if (!input) return '';
  try {
    const prepared = input.includes('://') ? input : `https://${input}`;
    const { hostname } = new URL(prepared);
    return hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return input.replace(/^www\./i, '').toLowerCase();
  }
}

module.exports = { normalizeUrl, formatHost, delay, normalizeHostname };
