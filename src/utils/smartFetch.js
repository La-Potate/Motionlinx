'use strict';

const https = require('https');
const undici = require('undici');
const { Agent: UndiciAgent, setGlobalDispatcher } = undici;
const logger = require('./logger');
const { guardedLookup, buildGuardedConnector } = require('./ssrfGuard');

// Node 20+ has native global fetch (undici under the hood). `package.json#engines`
// enforces Node >=20, so we can rely on it unconditionally and drop the
// node-fetch polyfill.
if (typeof globalThis.fetch !== 'function') {
  throw new Error(
    'globalThis.fetch is not defined. This project requires Node 20+ (see package.json engines).',
  );
}
const cachedFetch = globalThis.fetch.bind(globalThis);

// Two ways to skip TLS verification, depending on which fetch lib we hand the
// request to:
//   - native fetch (undici): pass `dispatcher: insecureDispatcher`
//   - legacy http(s).request style: pass `agent: insecureAgent`
// Native global fetch silently ignores `agent`, so we keep both shapes here for
// any caller still using non-fetch network code, but the smart-fetch retry path
// drives undici via dispatcher.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

// Every outbound socket resolves through guardedLookup, so a user-supplied URL
// cannot reach loopback, the LAN, or link-local metadata — and neither can a
// redirect hop or a rebound DNS answer, since each opens a fresh connection
// through this same dispatcher. See utils/ssrfGuard.js.
const guardedDispatcher = new UndiciAgent({
  connect: buildGuardedConnector(undici, { lookup: guardedLookup }),
});
const insecureDispatcher = new UndiciAgent({
  connect: buildGuardedConnector(undici, {
    rejectUnauthorized: false,
    lookup: guardedLookup,
  }),
});

// Applies to bare `fetch()` too, which is what ensureFetch() hands back.
setGlobalDispatcher(guardedDispatcher);

const TLS_ERROR_CODES = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

const TLS_ERROR_KEYWORDS = [
  'self signed certificate',
  'unable to verify the first certificate',
  'certificate expired',
  'certificate has expired',
  'unable to get local issuer certificate',
];

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'EPROTO',
]);

const DEFAULT_FETCH_TIMEOUT_MS = 15000;

// Upper bound for a provider call made through ensureFetch(). Every
// integration (Serper, DataForSEO, Google Places and Custom Search, the Google
// OAuth token endpoints) used the bare global fetch with no timeout at all, so
// a hung upstream pinned the request — and its credit-guard finish hook, its
// rate-limit slot, any Playwright browser it held — until the socket died on
// its own. Generous because DataForSEO's live endpoints can legitimately take
// tens of seconds; callers with a longer job pass `timeout` explicitly.
const DEFAULT_UPSTREAM_TIMEOUT_MS = 60000;

/**
 * Abort when either input aborts. Avoids AbortSignal.any (Node >= 20.3 only).
 *
 * Returns the combined signal plus a `cleanup` that detaches the listeners
 * added to the inputs. A caller may reuse one long-lived signal (a background
 * job's, say) across hundreds of fetches; without cleanup every one of them
 * would leave a listener behind on that signal for the job's lifetime.
 */
function combineSignals(a, b) {
  if (!a) return { signal: b, cleanup: () => {} };
  if (!b) return { signal: a, cleanup: () => {} };
  const controller = new AbortController();
  const onA = () => controller.abort(a.reason);
  const onB = () => controller.abort(b.reason);
  if (a.aborted) controller.abort(a.reason);
  else a.addEventListener('abort', onA, { once: true });
  if (b.aborted) controller.abort(b.reason);
  else b.addEventListener('abort', onB, { once: true });
  const cleanup = () => {
    a.removeEventListener('abort', onA);
    b.removeEventListener('abort', onB);
  };
  return { signal: controller.signal, cleanup };
}

/**
 * fetch with a bound on how long it may take. Accepts a `timeout` (ms) option
 * in addition to the standard init fields; `timeout: 0` opts out. A caller's
 * own `signal` is respected alongside the timer.
 */
async function timedFetch(url, init = {}) {
  const { timeout, ...rest } = init || {};
  const ms = timeout === undefined ? DEFAULT_UPSTREAM_TIMEOUT_MS : timeout;
  if (!(ms > 0)) return cachedFetch(url, rest);
  const { signal, cleanup } = combineSignals(rest.signal, AbortSignal.timeout(ms));
  try {
    return await cachedFetch(url, { ...rest, signal });
  } finally {
    cleanup();
  }
}

/**
 * Resolves to the fetch every integration should use: native fetch, routed
 * through the SSRF-guarded dispatcher, with a default timeout. Kept async for
 * back-compat with call sites that `await ensureFetch()`.
 */
async function ensureFetch() {
  return timedFetch;
}

function isTlsRetryableError(error = {}) {
  if (!error) return false;
  const cause = error.cause || {};
  if (error.code && TLS_ERROR_CODES.has(error.code)) return true;
  if (cause.code && TLS_ERROR_CODES.has(cause.code)) return true;
  const message = `${error.message || ''} ${cause.message || ''}`.toLowerCase();
  return TLS_ERROR_KEYWORDS.some((keyword) => message.includes(keyword));
}

function isNetworkRetryableError(error = {}) {
  if (!error) return false;
  const cause = error.cause || {};
  if (error.code && NETWORK_ERROR_CODES.has(error.code)) return true;
  if (cause.code && NETWORK_ERROR_CODES.has(cause.code)) return true;
  const message = `${error.message || ''} ${cause.message || ''}`.toLowerCase();
  return message.includes('aborted') || message.includes('timeout');
}

/**
 * Fetch with an `AbortController`-based timeout.
 *
 * Default behavior is **secure** — bad certs throw, the same as a normal
 * browser request. Pass `allowInsecureRetry: true` to opt into a single retry
 * with `rejectUnauthorized: false` on TLS-class errors. This is intended for
 * crawling user-supplied URLs (customer sites with expired/self-signed certs);
 * never set it for calls to first-party APIs (DataForSEO, Serper, Claude,
 * Stripe, Google) where a cert downgrade would be a real attack surface.
 *
 * Network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND) are NOT retried — the
 * caller should decide whether a transient failure deserves a retry given
 * its rate-limit budget.
 */
async function fetchWithSmartAgent(url, options = {}) {
  const { allowInsecureRetry = false, timeout, agent, ...passthrough } = options;

  const attempt = async (useInsecure) => {
    const controller = new AbortController();
    const timeoutMs = timeout ?? DEFAULT_FETCH_TIMEOUT_MS;
    const finalOptions = {
      ...passthrough,
      signal: controller.signal,
    };
    if (useInsecure) {
      finalOptions.dispatcher = insecureDispatcher;
    }
    let timeoutId;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }
    try {
      return await cachedFetch(url, finalOptions);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  try {
    return await attempt(false);
  } catch (error) {
    if (
      allowInsecureRetry &&
      url.startsWith('https://') &&
      (isTlsRetryableError(error) || isNetworkRetryableError(error))
    ) {
      logger.warn(
        { url, code: error.code, msg: error.message },
        'TLS/network error — retrying with rejectUnauthorized:false (allowInsecureRetry=true)',
      );
      return await attempt(true);
    }
    throw error;
  }
}

module.exports = {
  ensureFetch,
  timedFetch,
  combineSignals,
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  guardedDispatcher,
  fetchWithSmartAgent,
  isTlsRetryableError,
  isNetworkRetryableError,
  insecureAgent,
  insecureDispatcher,
  DEFAULT_FETCH_TIMEOUT_MS,
};
