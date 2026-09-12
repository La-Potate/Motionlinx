'use strict';

const { dbAll } = require('../utils/dbAsync');
const { readUserApiKeysFromDisk } = require('../storage/userSettings');
const { decryptSecret } = require('../utils/crypto');
const { ensureFetch } = require('../utils/smartFetch');

/**
 * Resolve a user's Google Custom Search credentials (API key + search engine id).
 * Reads from the user_settings table first, falls back to per-user disk
 * settings.json (legacy path).
 */
async function getUserGoogleSearchConfig(userId) {
  if (!userId) return { apiKey: null, cx: null };
  const rows = await dbAll(
    `SELECT setting_key, setting_value FROM user_settings
     WHERE user_id = ? AND setting_key IN ('google_api_key', 'google_cx')`,
    [userId],
  );
  let apiKey = '';
  let cx = '';
  rows.forEach((row) => {
    if (row.setting_key === 'google_api_key') {
      apiKey = decryptSecret(row.setting_value) || '';
    }
    if (row.setting_key === 'google_cx') {
      cx = decryptSecret(row.setting_value) || '';
    }
  });
  if (!apiKey || !cx) {
    const disk = readUserApiKeysFromDisk(userId);
    if (!apiKey && disk.googleApiKey) apiKey = disk.googleApiKey;
    if (!cx && disk.googleCx) cx = disk.googleCx;
  }
  return { apiKey: apiKey || null, cx: cx || null };
}

/**
 * Query Google's Custom Search API and find the absolute position of any
 * result whose host matches `targetHost`. Paginates up to `maxResults`.
 */
async function fetchGoogleSearchRank({
  keyword,
  targetHost,
  apiKey,
  cx,
  country,
  language,
  maxResults = 50,
}) {
  if (!apiKey || !cx) throw new Error('Missing Google Custom Search credentials');
  if (!keyword) throw new Error('Keyword is required');
  if (!targetHost) throw new Error('Target website/domain is required to evaluate ranking');

  const maxPages = Math.max(1, Math.min(Math.ceil(maxResults / 10), 10));
  const snapshot = [];
  const fetcher = await ensureFetch();
  let matchedPosition = null;
  let start = 1;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q: keyword,
      num: '10',
      start: String(start),
    });
    if (country) params.set('gl', country.toLowerCase());
    if (language) params.set('hl', language.toLowerCase());

    // eslint-disable-next-line no-await-in-loop
    const response = await fetcher(
      `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
    );
    if (!response.ok) {
      // eslint-disable-next-line no-await-in-loop
      const body = await response.text();
      throw new Error(`Google Custom Search error (${response.status}): ${body}`);
    }
    // eslint-disable-next-line no-await-in-loop
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    items.forEach((item, idx) => {
      const absolutePosition = start + idx;
      snapshot.push({
        position: absolutePosition,
        title: item.title || '',
        link: item.link || '',
        displayLink: item.displayLink || '',
        snippet: item.snippet || '',
      });
      if (matchedPosition) return;
      const candidates = [];
      if (item.link) {
        try {
          candidates.push(new URL(item.link).hostname.replace(/^www\./i, '').toLowerCase());
        } catch (_) {
          // ignore
        }
      }
      if (item.displayLink) {
        candidates.push(item.displayLink.replace(/^www\./i, '').toLowerCase());
      }
      if (candidates.some((host) => host === targetHost || host.endsWith(`.${targetHost}`))) {
        matchedPosition = absolutePosition;
      }
    });

    if (matchedPosition) break;
    const hasNextPage = data?.queries?.nextPage && data.queries.nextPage.length > 0;
    if (!hasNextPage) break;
    start += 10;
  }

  return { position: matchedPosition, snapshot };
}

module.exports = { getUserGoogleSearchConfig, fetchGoogleSearchRank };
