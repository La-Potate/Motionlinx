'use strict';

const logger = require('../utils/logger');
const { ensureFetch } = require('../utils/smartFetch');

/**
 * Validate a credential by making the cheapest real call each provider offers.
 *
 * The point is to fail at the moment of entry rather than three screens later
 * inside a tool. Every check distinguishes three outcomes:
 *
 *   ok:false, reason:'invalid'    the provider rejected the credential
 *   ok:false, reason:'unreachable' we could not ask (network/DNS/timeout)
 *   ok:true                        the provider accepted it
 *
 * That distinction matters: telling someone their key is wrong when the NAS
 * simply had no outbound DNS would send them chasing the wrong problem.
 */

const TIMEOUT_MS = 12000;

function fail(reason, message) {
  return { ok: false, reason, message };
}

async function withFetch(fn) {
  const fetcher = await ensureFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fn(fetcher, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Serper — 1 credit, smallest possible query. */
async function testSerper(key) {
  if (!key) return fail('missing', 'No key provided.');
  try {
    return await withFetch(async (fetcher, signal) => {
      const res = await fetcher('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
        body: JSON.stringify({ q: 'test', num: 1 }),
        signal,
      });
      if (res.status === 401 || res.status === 403) {
        return fail('invalid', 'Serper rejected this key.');
      }
      if (!res.ok) return fail('invalid', `Serper returned ${res.status}.`);
      return { ok: true, message: 'Key works.' };
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Serper key test failed to connect');
    return fail('unreachable', 'Could not reach Serper.');
  }
}

/** Anthropic — a 1-token message is the cheapest authenticated call. */
async function testClaude(key) {
  if (!key) return fail('missing', 'No key provided.');
  try {
    return await withFetch(async (fetcher, signal) => {
      const res = await fetcher('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal,
      });
      if (res.status === 401 || res.status === 403) {
        return fail('invalid', 'Anthropic rejected this key.');
      }
      // 400 here means the key authenticated and the request shape was the
      // problem, which still proves the credential.
      if (res.ok || res.status === 400) return { ok: true, message: 'Key works.' };
      if (res.status === 429) return { ok: true, message: 'Key works (rate limited).' };
      return fail('invalid', `Anthropic returned ${res.status}.`);
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Anthropic key test failed to connect');
    return fail('unreachable', 'Could not reach Anthropic.');
  }
}

/** DataForSEO — basic auth against a free endpoint. */
async function testDataForSeo({ login, password }) {
  if (!login || !password) return fail('missing', 'Login and password are both required.');
  try {
    return await withFetch(async (fetcher, signal) => {
      const auth = Buffer.from(`${login}:${password}`).toString('base64');
      const res = await fetcher('https://api.dataforseo.com/v3/appendix/user_data', {
        method: 'GET',
        headers: { Authorization: `Basic ${auth}` },
        signal,
      });
      if (res.status === 401) return fail('invalid', 'DataForSEO rejected these credentials.');
      if (!res.ok) return fail('invalid', `DataForSEO returned ${res.status}.`);
      const data = await res.json().catch(() => null);
      const balance = data?.tasks?.[0]?.result?.[0]?.money?.balance;
      return {
        ok: true,
        message:
          typeof balance === 'number'
            ? `Credentials work. Balance: $${balance.toFixed(2)}.`
            : 'Credentials work.',
      };
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'DataForSEO key test failed to connect');
    return fail('unreachable', 'Could not reach DataForSEO.');
  }
}

/** Google Places — a trivial text search proves the key AND that Places is on. */
async function testGooglePlaces(key) {
  if (!key) return fail('missing', 'No key provided.');
  try {
    return await withFetch(async (fetcher, signal) => {
      const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
      url.searchParams.set('query', 'coffee');
      url.searchParams.set('key', key);
      const res = await fetcher(url.toString(), { signal });
      const data = await res.json().catch(() => null);
      const status = data?.status;
      if (status === 'REQUEST_DENIED') {
        // Google puts the useful detail in error_message — usually either a
        // bad key or the Places API not enabled on the project.
        return fail('invalid', data?.error_message || 'Google rejected this key.');
      }
      if (status === 'OVER_QUERY_LIMIT') return fail('invalid', 'Key is over its quota.');
      if (status === 'OK' || status === 'ZERO_RESULTS') {
        return { ok: true, message: 'Key works with the Places API.' };
      }
      return fail('invalid', data?.error_message || `Google returned ${status || res.status}.`);
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Google Places key test failed to connect');
    return fail('unreachable', 'Could not reach Google.');
  }
}

/** Custom Search needs the key AND the engine id, so both are tested together. */
async function testGoogleSearch({ key, cx }) {
  if (!key || !cx) return fail('missing', 'Both an API key and a Search Engine ID are required.');
  try {
    return await withFetch(async (fetcher, signal) => {
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('key', key);
      url.searchParams.set('cx', cx);
      url.searchParams.set('q', 'test');
      url.searchParams.set('num', '1');
      const res = await fetcher(url.toString(), { signal });
      if (res.ok) return { ok: true, message: 'Key and Search Engine ID work.' };
      const data = await res.json().catch(() => null);
      const reason = data?.error?.message || `Google returned ${res.status}.`;
      if (res.status === 400 || res.status === 403) return fail('invalid', reason);
      return fail('invalid', reason);
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Google Search key test failed to connect');
    return fail('unreachable', 'Could not reach Google.');
  }
}

module.exports = {
  testSerper,
  testClaude,
  testDataForSeo,
  testGooglePlaces,
  testGoogleSearch,
};
