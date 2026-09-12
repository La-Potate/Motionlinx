'use strict';

const dns = require('dns');
const net = require('net');
const { env } = require('../config/env');

/**
 * Block server-side requests to addresses that are not on the public internet.
 *
 * Several features take a URL from the user and fetch it on the server — page
 * capture (Site Marker, Page Commenter), the spider-web crawler, bulk HTTP
 * checks and schema autofill. Without this guard those are a general-purpose
 * read primitive against whatever the server can reach, and the fetched body
 * is handed straight back to the caller. On the intended deployment — a NAS on
 * a home or office LAN, published through a Cloudflare tunnel — that means any
 * signed-in account could read the NAS admin panel, reach sibling containers,
 * call this app's own API over loopback, and use bulk HTTP as a port scanner.
 *
 * Enforcement lives in the DNS lookup rather than in a URL check, because a URL
 * check alone is bypassable two ways: a public hostname can redirect to an
 * internal address, and a hostname that resolved publicly once can resolve to
 * 127.0.0.1 on the connection that follows (DNS rebinding). Hooking `lookup`
 * means every socket — the first request and every redirect hop — is checked
 * against the address actually being connected to.
 *
 * Set ALLOW_PRIVATE_URL_FETCH=1 to turn this off for an install that genuinely
 * needs to audit internal sites. It is off by default: opting in to scanning
 * your own LAN should be a deliberate act.
 */

function allowPrivateFetch() {
  const raw = String(env.ALLOW_PRIVATE_URL_FETCH || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out << 8) + n;
  }
  return out >>> 0;
}

/** [network, prefix-length] pairs that must never be reached. */
const BLOCKED_V4 = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // RFC1918 private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // RFC1918 private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16], // RFC1918 private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. 255.255.255.255
];

function isBlockedIpv4(ip) {
  const value = ipv4ToInt(ip);
  if (value === null) return true; // unparseable: fail closed
  return BLOCKED_V4.some(([network, bits]) => {
    const base = ipv4ToInt(network);
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

function expandIpv6(ip) {
  let addr = ip;
  const zone = addr.indexOf('%');
  if (zone !== -1) addr = addr.slice(0, zone);
  const [head, tail = ''] = addr.split('::');
  const headParts = head ? head.split(':').filter(Boolean) : [];
  const tailParts = tail ? tail.split(':').filter(Boolean) : [];
  const missing = 8 - (headParts.length + tailParts.length);
  const parts = addr.includes('::')
    ? [...headParts, ...Array(Math.max(missing, 0)).fill('0'), ...tailParts]
    : addr.split(':');
  if (parts.length !== 8) return null;
  return parts.map((p) => parseInt(p || '0', 16));
}

function isBlockedIpv6(ip) {
  const lower = ip.toLowerCase();

  // IPv4-mapped (::ffff:127.0.0.1) and NAT64 (64:ff9b::/96) carry an IPv4
  // address inside them, which is the address the packet actually reaches.
  const mapped = lower.match(/(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);

  const groups = expandIpv6(lower);
  if (!groups || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) return true;

  const isZero = groups.every((g) => g === 0);
  if (isZero) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1

  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  // ::ffff:0:0/96 expressed in hex form rather than dotted-quad.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const a = (groups[6] >> 8) & 0xff;
    const b = groups[6] & 0xff;
    const c = (groups[7] >> 8) & 0xff;
    const d = groups[7] & 0xff;
    return isBlockedIpv4(`${a}.${b}.${c}.${d}`);
  }
  return false;
}

/** True when this literal IP must not be connected to. */
function isBlockedIp(ip) {
  if (typeof ip !== 'string' || !ip) return true;
  const family = net.isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return true; // not an IP at all: fail closed
}

function blockedError(hostname, address) {
  const err = new Error(
    `Refusing to fetch ${hostname}: it resolves to ${address}, which is not a public internet address.`,
  );
  err.code = 'ERR_SSRF_BLOCKED';
  err.status = 400;
  return err;
}

/**
 * A `dns.lookup`-compatible function that refuses non-public addresses.
 * Passed to undici's connect options so it runs for every socket.
 */
function guardedLookup(hostname, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : options || {};

  if (allowPrivateFetch()) return dns.lookup(hostname, opts, cb);

  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    if (!list.length) return cb(new Error(`No address found for ${hostname}`));

    for (const entry of list) {
      if (isBlockedIp(entry.address)) return cb(blockedError(hostname, entry.address));
    }
    if (opts.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

/**
 * An undici connector that refuses to hand back a socket pointed at a
 * non-public address.
 *
 * `guardedLookup` alone is not enough: when the host is already an IP literal
 * there is no DNS step, so undici never calls lookup and `http://127.0.0.1/`
 * sailed straight through. Checking at connect time covers both cases, and
 * runs once per connection — so every redirect hop is checked too, not just
 * the URL the user typed. The post-connect `remoteAddress` check is what
 * closes DNS rebinding: it is the address the socket actually reached.
 */
function buildGuardedConnector(undici, connectOptions = {}) {
  const baseConnector = undici.buildConnector(connectOptions);
  return function guardedConnect(options, callback) {
    if (allowPrivateFetch()) return baseConnector(options, callback);

    const host = String(options.hostname || options.host || '').replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isBlockedIp(host)) {
      return callback(blockedError(host, host));
    }
    return baseConnector(options, (err, socket) => {
      if (err) return callback(err);
      const peer = socket && socket.remoteAddress;
      if (peer && isBlockedIp(peer)) {
        socket.destroy();
        return callback(blockedError(host || peer, peer));
      }
      return callback(null, socket);
    });
  };
}

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Cheap up-front check so a blocked target fails with a clear 400 instead of a
 * generic fetch error. This is a courtesy, not the enforcement boundary —
 * `guardedLookup` is what actually stops the connection.
 */
function assertPublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const err = new Error('Enter a valid URL.');
    err.status = 400;
    throw err;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    const err = new Error(`Unsupported URL scheme "${parsed.protocol}". Use http or https.`);
    err.code = 'ERR_SSRF_BLOCKED';
    err.status = 400;
    throw err;
  }
  if (allowPrivateFetch()) return parsed;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname) && isBlockedIp(hostname)) {
    throw blockedError(parsed.hostname, hostname);
  }
  // Hostnames that never route publicly. Anything else is settled at lookup.
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) {
    throw blockedError(parsed.hostname, lower);
  }
  return parsed;
}

module.exports = {
  isBlockedIp,
  guardedLookup,
  buildGuardedConnector,
  assertPublicUrl,
  allowPrivateFetch,
};
