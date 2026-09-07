'use strict';

const { resolveClientIp } = require('../utils/http');
const net = require('node:net');
const logger = require('../utils/logger');
const { STRIPE_WEBHOOK_IPS } = require('../config/env');

/**
 * Defense-in-depth IP allowlist for the Stripe webhook endpoint. Signature
 * verification is still the primary auth mechanism; this just rejects traffic
 * that didn't come from Stripe's published ranges before we even consider the
 * signature, cutting attack surface for forged signature replays.
 *
 * Configure via `STRIPE_WEBHOOK_IPS` env (comma-separated CIDR / IP list), or
 * set it to `auto` to use the bundled snapshot below. If the env is empty
 * (default), the middleware is a no-op and signature verification alone gates
 * the endpoint.
 *
 * Last refreshed: 2026-05-27 from https://stripe.com/files/ips/ips_webhooks.json
 * Refresh this snapshot periodically — Stripe occasionally adds new ranges.
 */
const STRIPE_WEBHOOK_IPS_DEFAULT = [
  '3.18.12.63/32',
  '3.130.192.231/32',
  '13.235.14.237/32',
  '13.235.122.149/32',
  '18.211.135.69/32',
  '35.154.171.200/32',
  '52.15.183.38/32',
  '54.88.130.119/32',
  '54.88.130.237/32',
  '54.187.174.169/32',
  '54.187.205.235/32',
  '54.187.216.72/32',
];

function parseRanges(raw) {
  if (!raw) return null;
  const list = raw === 'auto' ? STRIPE_WEBHOOK_IPS_DEFAULT : raw.split(',');
  const blocklist = new net.BlockList();
  let added = 0;
  for (const entry of list) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [addr, cidrPart] = trimmed.split('/');
    const type = net.isIPv6(addr) ? 'ipv6' : 'ipv4';
    try {
      if (cidrPart !== undefined) {
        blocklist.addSubnet(addr, parseInt(cidrPart, 10), type);
      } else {
        blocklist.addAddress(addr, type);
      }
      added += 1;
    } catch (err) {
      logger.warn({ entry: trimmed, err: err.message }, 'Invalid Stripe webhook IP entry');
    }
  }
  return added > 0 ? blocklist : null;
}

const allowlist = parseRanges(STRIPE_WEBHOOK_IPS);

// Uses the shared resolver so this control honours TRUST_PROXY like the rest
// of the app. Reading X-Forwarded-For unconditionally would let anyone forge a
// Stripe address and slip past the allowlist; signature verification would
// still catch them, but an allowlist that any client can satisfy is not one.
function extractClientIp(req) {
  return resolveClientIp(req);
}

function stripeIpAllowlist(req, res, next) {
  if (!allowlist) return next();
  const ip = extractClientIp(req);
  if (!ip) {
    logger.warn('Stripe webhook: no client IP available, denying');
    return res.status(403).json({ error: 'Forbidden' });
  }
  const type = net.isIPv6(ip) ? 'ipv6' : 'ipv4';
  if (!net.isIP(ip) || !allowlist.check(ip, type)) {
    logger.warn({ ip }, 'Stripe webhook: source IP not in allowlist');
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

module.exports = stripeIpAllowlist;
