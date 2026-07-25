'use strict';

const logger = require('../utils/logger');
const { ensureFetch } = require('./claude');
const { db } = require('../utils/dbAsync');
const { readUserSettingsFromDisk } = require('../storage/userSettings');
const { decryptSecret } = require('../utils/crypto');
const { DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD } = require('../config/env');

// ---- Endpoints ----
const ENDPOINTS = {
  KEYWORD: 'https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live',
  SITE: 'https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_site/live',
  LABS_SUGGESTIONS: 'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live',
  SEARCH_VOLUME: 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live',
  LOCATIONS: 'https://api.dataforseo.com/v3/keywords_data/google_ads/locations',
  BUSINESS_INFO: 'https://api.dataforseo.com/v3/business_data/google/my_business_info/live',
  BUSINESS_SEARCH: 'https://api.dataforseo.com/v3/business_data/business_listings/search/live',
  AI_KEYWORD_DATA:
    'https://api.dataforseo.com/v3/ai_optimization/ai_keyword_data/keywords_search_volume/live',
  LLM_SCRAPER:
    'https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced',
  // On-Page API: async task lifecycle (post → ready → results).
  ONPAGE_TASK_POST: 'https://api.dataforseo.com/v3/on_page/task_post',
  ONPAGE_TASKS_READY: 'https://api.dataforseo.com/v3/on_page/tasks_ready',
  ONPAGE_SUMMARY: 'https://api.dataforseo.com/v3/on_page/summary',
  ONPAGE_PAGES: 'https://api.dataforseo.com/v3/on_page/pages',
  ONPAGE_RESOURCES: 'https://api.dataforseo.com/v3/on_page/resources',
  ONPAGE_LINKS: 'https://api.dataforseo.com/v3/on_page/links',
  ONPAGE_DUPLICATE_CONTENT: 'https://api.dataforseo.com/v3/on_page/duplicate_content',
  ONPAGE_DUPLICATE_TAGS: 'https://api.dataforseo.com/v3/on_page/duplicate_tags',
  ONPAGE_INSTANT_PAGES: 'https://api.dataforseo.com/v3/on_page/instant_pages',
  // Lighthouse: live single-URL audit.
  LIGHTHOUSE_LIVE: 'https://api.dataforseo.com/v3/on_page/lighthouse/live/json',
  // Labs (cheaper than Google Ads for ranked/competitor research).
  LABS_RANKED_KEYWORDS: 'https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live',
  LABS_KEYWORD_IDEAS: 'https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live',
  LABS_COMPETITORS_DOMAIN: 'https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live',
  LABS_DOMAIN_INTERSECTION: 'https://api.dataforseo.com/v3/dataforseo_labs/google/domain_intersection/live',
};

const DATAFORSEO_LOCATIONS_LIMIT = 5000;

// ---- Geo / location helpers ----
const DEFAULT_LOCATION_KEY = 'us';
const DEFAULT_LOCATION_CONFIG = {
  location_code: 2840,
  language_code: 'en',
  label: 'United States',
  location_name: 'United States',
  country_iso_code: 'US',
};

const GEO_LOCATION_MAP = {
  us: { label: 'United States', location_code: 2840, language_code: 'en', country_iso_code: 'US' },
  ca: { label: 'Canada', location_code: 2124, language_code: 'en', country_iso_code: 'CA' },
  gb: { label: 'United Kingdom', location_code: 2826, language_code: 'en', country_iso_code: 'GB' },
  au: { label: 'Australia', location_code: 2036, language_code: 'en', country_iso_code: 'AU' },
  nz: { label: 'New Zealand', location_code: 2277, language_code: 'en', country_iso_code: 'NZ' },
  in: { label: 'India', location_code: 2356, language_code: 'en', country_iso_code: 'IN' },
  de: { label: 'Germany', location_code: 2276, language_code: 'de', country_iso_code: 'DE' },
  fr: { label: 'France', location_code: 2250, language_code: 'fr', country_iso_code: 'FR' },
  es: { label: 'Spain', location_code: 2724, language_code: 'es', country_iso_code: 'ES' },
  mx: { label: 'Mexico', location_code: 2484, language_code: 'es', country_iso_code: 'MX' },
};

const LANGUAGE_BY_COUNTRY = Object.fromEntries(
  Object.values(GEO_LOCATION_MAP).map((entry) => [
    (entry.country_iso_code || '').toLowerCase(),
    (entry.language_code || 'en').toLowerCase(),
  ]),
);

const COUNTRY_NORMALIZATION_MAP = {
  uk: 'gb',
  gbr: 'gb',
  'united kingdom': 'gb',
  'great britain': 'gb',
  england: 'gb',
  scotland: 'gb',
  wales: 'gb',
  usa: 'us',
  'united states': 'us',
  aus: 'au',
  'australia': 'au',
  can: 'ca',
  'canada': 'ca',
  nzl: 'nz',
  'new zealand': 'nz',
  ind: 'in',
  india: 'in',
  deu: 'de',
  germany: 'de',
  fra: 'fr',
  france: 'fr',
  esp: 'es',
  spain: 'es',
  mex: 'mx',
  mexico: 'mx',
};

const normalizeCountryCode = (value = '') => {
  if (!value || typeof value !== 'string') return '';
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return '';
  if (COUNTRY_NORMALIZATION_MAP[cleaned]) return COUNTRY_NORMALIZATION_MAP[cleaned];
  if (cleaned.length === 2) return cleaned;
  if (COUNTRY_NORMALIZATION_MAP[cleaned.replace(/\s+/g, '')]) {
    return COUNTRY_NORMALIZATION_MAP[cleaned.replace(/\s+/g, '')];
  }
  if (cleaned.length === 3 && COUNTRY_NORMALIZATION_MAP[cleaned.slice(0, 3)]) {
    return COUNTRY_NORMALIZATION_MAP[cleaned.slice(0, 3)];
  }
  return cleaned.slice(0, 2);
};

const normalizeLanguageCode = (value = '') => {
  if (!value || typeof value !== 'string') return '';
  return value.trim().toLowerCase().split('-')[0];
};

const inferLanguageFromCountry = (country = '') => {
  const normalized = normalizeCountryCode(country);
  return LANGUAGE_BY_COUNTRY[normalized] || '';
};

const buildFallbackLocationList = () =>
  Object.values(GEO_LOCATION_MAP).map((entry) => ({
    location_code: entry.location_code,
    location_name: entry.label,
    label: entry.label,
    language_code: entry.language_code || 'en',
    country_iso_code: entry.country_iso_code || null,
  }));

const filterFallbackLocations = (query) => {
  const normalized = (query || '').trim().toLowerCase();
  const list = buildFallbackLocationList();
  if (!normalized) return list.slice(0, 10);
  return list
    .filter((loc) => loc.location_name.toLowerCase().includes(normalized))
    .slice(0, 10);
};

const getGeoTargetsForKey = (key = DEFAULT_LOCATION_KEY) => {
  const normalized = (key || DEFAULT_LOCATION_KEY).toLowerCase();
  return GEO_LOCATION_MAP[normalized] || GEO_LOCATION_MAP[DEFAULT_LOCATION_KEY];
};

const buildLocationSettings = (requested = {}) => {
  const rawCode =
    requested.location_code ??
    requested.locationCode ??
    requested.code ??
    requested.id ??
    requested.numeric_id ??
    null;
  const parsedCode = rawCode ? parseInt(rawCode, 10) : null;
  const language =
    requested.language_code ?? requested.languageCode ?? requested.language ?? null;
  const label =
    requested.label ??
    requested.location_name ??
    requested.locationName ??
    requested.name ??
    null;
  const country =
    requested.country_iso_code ?? requested.country_iso ?? requested.country ?? null;

  if (Number.isInteger(parsedCode) && parsedCode > 0) {
    return {
      location_code: parsedCode,
      language_code: language || 'en',
      label: label || `Location ${parsedCode}`,
      location_name: label || `Location ${parsedCode}`,
      country_iso_code: country || null,
    };
  }

  const fallbackKey =
    requested.location_key ||
    requested.locationKey ||
    requested.geo ||
    requested.defaultKey ||
    DEFAULT_LOCATION_KEY;
  const fallback = getGeoTargetsForKey(fallbackKey);
  const fallbackCode = Number(fallback.location_code) || DEFAULT_LOCATION_CONFIG.location_code;
  return {
    location_code: fallbackCode,
    language_code: fallback.language_code || DEFAULT_LOCATION_CONFIG.language_code,
    label: fallback.label || DEFAULT_LOCATION_CONFIG.label,
    location_name: fallback.label || DEFAULT_LOCATION_CONFIG.label,
    country_iso_code: fallback.country_iso_code || DEFAULT_LOCATION_CONFIG.country_iso_code,
  };
};

// ---- Credential resolution ----
function resolveCredentials(userCreds = {}) {
  return {
    login: userCreds.login || DATAFORSEO_LOGIN || '',
    password: userCreds.password || DATAFORSEO_PASSWORD || '',
  };
}

const tryDecodeToken = (value) => {
  if (!value || typeof value !== 'string') return null;
  const sanitized = value.trim();
  if (sanitized.length < 8 || /[^A-Za-z0-9+/=]/.test(sanitized)) return null;
  try {
    const decoded = Buffer.from(sanitized, 'base64').toString('utf8');
    if (!decoded.includes(':')) return null;
    const [tokenLogin, tokenPassword] = decoded.split(':');
    if (tokenLogin && tokenPassword) {
      return { login: tokenLogin.trim(), password: tokenPassword.trim() };
    }
  } catch (_err) {
    return null;
  }
  return null;
};

/**
 * Resolves DataForSEO credentials for a user, in order:
 *   1. user_settings table (per-user saved creds)
 *   2. disk-backed user settings (legacy fallback)
 *   3. first admin user's saved creds (shared platform creds)
 *   4. env-level DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD
 *
 * Supports both split login/password and a single base64-encoded
 * "login:password" token (legacy `dataForSeo_api_key`).
 */
const getUserDataForSeoCredentials = async (userId) => {
  const dbKeys = await new Promise((resolve) => {
    db.all(
      `SELECT setting_key, setting_value FROM user_settings WHERE user_id = ? AND setting_key IN ('dataForSeo_login', 'dataForSeo_password', 'dataForSeo_api_key')`,
      [userId],
      (err, rows = []) => {
        if (err) {
          logger.error({ err }, 'Failed to load DataForSEO credentials from DB');
          return resolve({});
        }
        const mapped = {};
        rows.forEach((row) => {
          mapped[row.setting_key] = decryptSecret(row.setting_value) || '';
        });
        resolve(mapped);
      },
    );
  });
  const diskSettings = readUserSettingsFromDisk(userId);
  const diskKeys = (diskSettings && diskSettings.apiKeys) || {};
  let login = dbKeys.dataForSeo_login || diskKeys.dataForSeoLogin || '';
  let password = dbKeys.dataForSeo_password || diskKeys.dataForSeoPassword || '';
  const legacy = dbKeys.dataForSeo_api_key || diskKeys.dataForSeo || '';

  const decodedPasswordField = tryDecodeToken(password);
  if (decodedPasswordField) {
    login = decodedPasswordField.login;
    password = decodedPasswordField.password;
  } else if (!login || !password) {
    const decodedLegacy = tryDecodeToken(legacy);
    if (decodedLegacy) {
      login = login || decodedLegacy.login;
      password = password || decodedLegacy.password;
    }
  }

  if ((!login || !password) && userId) {
    const adminKeys = await new Promise((resolve) => {
      db.all(
        `SELECT setting_key, setting_value FROM user_settings WHERE user_id IN (SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1) AND setting_key IN ('dataForSeo_login', 'dataForSeo_password', 'dataForSeo_api_key')`,
        [],
        (_err, rows = []) => {
          const mapped = {};
          rows.forEach((row) => {
            mapped[row.setting_key] = row.setting_value || '';
          });
          resolve(mapped);
        },
      );
    });
    const adminLogin = adminKeys.dataForSeo_login || '';
    const adminPassword = adminKeys.dataForSeo_password || '';
    const adminLegacy = adminKeys.dataForSeo_api_key || '';
    const decodedAdmin = tryDecodeToken(adminPassword) || tryDecodeToken(adminLegacy);
    if (decodedAdmin) {
      login = login || decodedAdmin.login;
      password = password || decodedAdmin.password;
    } else {
      login = login || adminLogin;
      password = password || adminPassword;
    }
  }

  if (!login && DATAFORSEO_LOGIN) login = DATAFORSEO_LOGIN;
  if (!password && DATAFORSEO_PASSWORD) password = DATAFORSEO_PASSWORD;

  return { login, password };
};

// ---- Generic task runner ----
async function performTask(endpoint, payload, creds = {}) {
  if (!creds.login || !creds.password) {
    throw new Error('DataForSEO credentials are missing');
  }

  const fetcher = await ensureFetch();
  const authHeader =
    'Basic ' + Buffer.from(`${creds.login}:${creds.password}`).toString('base64');

  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `DataForSEO request failed (${response.status}): ${text?.slice(0, 200) || 'Unknown error'}`,
    );
  }

  const data = await response.json();
  const task = data?.tasks?.[0];
  if (!task) {
    logger.error({ data: JSON.stringify(data).slice(0, 2000) }, 'DataForSEO response missing task payload');
    throw new Error('Unexpected DataForSEO response: task payload missing.');
  }
  if (task.status_code && task.status_code !== 20000) {
    const message =
      task.status_message || task.error || task.error_message || 'DataForSEO reported an error status.';
    logger.error({ task: JSON.stringify(task).slice(0, 2000) }, 'DataForSEO task error');
    throw new Error(message);
  }
  return task;
}

// ---- Numeric helpers ----
const dollarsToMicros = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 1_000_000) : null;

const normalizeCompetition = (value) => {
  if (typeof value === 'string') return value.toUpperCase();
  if (typeof value === 'number') {
    if (value >= 0.66) return 'HIGH';
    if (value >= 0.33) return 'MEDIUM';
    return 'LOW';
  }
  return 'UNSPECIFIED';
};

// ---- Locations search (with TTL cache) ----
const DATAFORSEO_LOCATION_CACHE = new Map();
const DATAFORSEO_LOCATION_CACHE_TTL_MS = 10 * 60 * 1000;

const getCachedLocationSearch = (key) => {
  if (!key) return null;
  const cached = DATAFORSEO_LOCATION_CACHE.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    DATAFORSEO_LOCATION_CACHE.delete(key);
    return null;
  }
  return cached.payload;
};

const setCachedLocationSearch = (key, payload) => {
  if (!key) return;
  DATAFORSEO_LOCATION_CACHE.set(key, {
    payload,
    expiresAt: Date.now() + DATAFORSEO_LOCATION_CACHE_TTL_MS,
  });
};

const fetchDataForSeoLocations = async (query, creds = {}, { type, loadAll } = {}) => {
  const normalized = (query || '').trim();
  const cacheKey = `${type || 'any'}:${loadAll ? 'all' : normalized.toLowerCase()}`;
  const cached = getCachedLocationSearch(cacheKey);
  if (cached) return cached;

  const fetcher = await ensureFetch();
  const params = new URLSearchParams();
  if (normalized) params.set('q', normalized);
  params.set('limit', String(loadAll ? DATAFORSEO_LOCATIONS_LIMIT : 50));
  const url = `${ENDPOINTS.LOCATIONS}?${params.toString()}`;

  const authHeader = `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString('base64')}`;
  const response = await fetcher(url, {
    method: 'GET',
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Locations request failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const task = data?.tasks?.[0];
  if (!task || (task.status_code && task.status_code !== 20000)) {
    throw new Error(task?.status_message || 'Locations response invalid');
  }

  const resultBlocks = task?.result || [];
  const matches = [];

  resultBlocks.forEach((entry = {}) => {
    const code = Number(entry.location_code || entry.id || entry.code);
    if (!code) return;
    const entryType = entry.location_type || entry.type || null;
    matches.push({
      location_code: code,
      location_name:
        entry.location_name ||
        entry.name ||
        entry.canonical_name ||
        entry.location_name_canonical ||
        '',
      location_type: entryType,
      country_iso_code: entry.country_iso_code || entry.country || null,
      language_code: entry.language_code || entry.language || 'en',
    });
  });

  const deduped = [];
  const seen = new Set();
  matches.forEach((match) => {
    const key = `${match.location_code}:${match.language_code}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(match);
  });

  let filtered = deduped;
  if (type === 'city') {
    filtered = filtered.filter((loc) => (loc.location_type || '').toLowerCase() !== 'country');
  }

  const payloadForCache = filtered.length ? filtered : filterFallbackLocations(normalized);
  setCachedLocationSearch(cacheKey, payloadForCache);
  return payloadForCache;
};

// ---- Keyword ideas (Google Ads "keywords for keywords") ----
const fetchDataForSeoKeywordIdeas = async (
  { keywords, location_code, location_name, language_code },
  creds = {},
) => {
  if (!Array.isArray(keywords) || keywords.length === 0) return [];
  const fetcher = await ensureFetch();
  const numericLocation = Number(location_code);
  const safeLocationCode =
    Number.isFinite(numericLocation) && numericLocation > 0 ? numericLocation : null;
  const payload = [
    {
      keywords,
      include_seed_keyword: true,
      include_serp_info: false,
      search_partners: false,
      sort_by: 'relevance',
    },
  ];
  if (safeLocationCode) payload[0].location_code = safeLocationCode;
  else if (location_name) payload[0].location_name = location_name;
  if (language_code) payload[0].language_code = language_code;

  const response = await fetcher(ENDPOINTS.KEYWORD, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString('base64')}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DataForSEO request failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'DataForSEO error');
  }
  const task = data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    throw new Error(task?.status_message || 'DataForSEO task error');
  }
  const results = task.result || [];
  return results.map((kw = {}) => ({
    keyword: kw.keyword,
    avgMonthlySearches: kw.search_volume || 0,
    competition: normalizeCompetition(kw.competition ?? kw.competition_level),
    competitionIndex: kw.competition_index ?? null,
    lowTopOfPageBidMicros: dollarsToMicros(kw.low_top_of_page_bid_usd ?? kw.low_top_of_page_bid),
    highTopOfPageBidMicros: dollarsToMicros(kw.high_top_of_page_bid_usd ?? kw.high_top_of_page_bid),
    keywordDifficulty: kw.competition_index ?? null,
    cpc: kw.cpc ?? kw.cpc_usd ?? null,
    currency: kw.currency || 'USD',
    monthlySearches: kw.monthly_searches || [],
  }));
};

// ---- Keyword search volume ----
const fetchDataForSeoKeywordVolume = async (
  { keywords, location_code, location_name, language_code },
  creds = {},
  cap = 200,
) => {
  if (!Array.isArray(keywords) || keywords.length === 0) return [];
  const safeCode =
    Number.isFinite(Number(location_code)) && Number(location_code) > 0
      ? Number(location_code)
      : null;
  const task = {
    keywords,
    language_code: language_code || DEFAULT_LOCATION_CONFIG.language_code,
    search_partners: false,
    include_adult_keywords: false,
  };
  if (safeCode) task.location_code = safeCode;
  else if (location_name) task.location_name = location_name;
  const payload = [task];
  const taskResp = await performTask(ENDPOINTS.SEARCH_VOLUME, payload, creds);
  const resultBlocks = taskResp?.result || [];
  const items = [];
  resultBlocks.forEach((block) => {
    const inner = Array.isArray(block?.items) ? block.items : [];
    inner.forEach((item = {}) => {
      items.push({
        keyword: item.keyword,
        searchVolume: item.search_volume ?? 0,
        competition: normalizeCompetition(item.competition ?? item.competition_level),
        competitionIndex: item.competition_index ?? 0,
        difficulty: item.competition_index ?? 0,
        cpc: item.cpc ?? null,
        lowBid: item.low_top_of_page_bid ?? null,
        highBid: item.high_top_of_page_bid ?? null,
        monthlySearches: item.monthly_searches || [],
      });
    });
  });
  return items.slice(0, cap);
};

// ---- AI keyword search volume (DataForSEO AI Optimization API) ----
const fetchDataForSeoAiKeywordData = async (
  { keywords, location_code, location_name, language_code },
  creds = {},
  cap = 200,
) => {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return { items: [], location: null };
  }
  const fetcher = await ensureFetch();
  const safeCode =
    Number.isFinite(Number(location_code)) && Number(location_code) > 0
      ? Number(location_code)
      : null;
  const payload = [
    { keywords, language_code: language_code || DEFAULT_LOCATION_CONFIG.language_code },
  ];
  if (safeCode) payload[0].location_code = safeCode;
  else if (location_name) payload[0].location_name = location_name;

  const response = await fetcher(ENDPOINTS.AI_KEYWORD_DATA, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString('base64')}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`DataForSEO AI keyword data failed (${response.status}): ${rawText?.slice(0, 200)}`);
  }

  let parsed;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    throw new Error('Invalid response from DataForSEO AI keyword data endpoint.');
  }

  const taskPayload =
    Array.isArray(parsed?.tasks) && parsed.tasks.length ? parsed.tasks[0] : parsed;
  if (!taskPayload) {
    throw new Error('DataForSEO AI keyword data response missing task payload.');
  }
  if (taskPayload.status_code && taskPayload.status_code !== 20000) {
    throw new Error(taskPayload.status_message || taskPayload.error || 'DataForSEO AI error');
  }

  const resultBlocks =
    Array.isArray(taskPayload.result) && taskPayload.result.length
      ? taskPayload.result
      : Array.isArray(taskPayload.items)
        ? [
            {
              items: taskPayload.items,
              location_code: taskPayload.location_code,
              language_code: taskPayload.language_code,
              location_name: taskPayload.location_name,
            },
          ]
        : [];

  const normalizedLocation = {
    location_code: safeCode,
    location_name: location_name || null,
    language_code: language_code || DEFAULT_LOCATION_CONFIG.language_code,
    country_iso_code: null,
  };

  const items = [];
  resultBlocks.forEach((block = {}) => {
    const blockItems = Array.isArray(block.items) ? block.items : [];
    if (Number.isFinite(Number(block.location_code))) {
      normalizedLocation.location_code = Number(block.location_code);
    }
    if (block.location_name) normalizedLocation.location_name = block.location_name;
    if (block.language_code) normalizedLocation.language_code = block.language_code;

    blockItems.forEach((item = {}) => {
      const keyword =
        typeof item.keyword === 'string'
          ? item.keyword
          : typeof item.keyword_data === 'string'
            ? item.keyword_data
            : '';
      if (!keyword) return;
      const aiVolume = Number(item.ai_search_volume ?? item.search_volume ?? 0) || 0;
      const monthly = Array.isArray(item.ai_monthly_searches)
        ? item.ai_monthly_searches.map((entry = {}) => ({
            year: Number(entry.year) || null,
            month: Number(entry.month) || null,
            ai_search_volume:
              Number(entry.ai_search_volume ?? entry.search_volume ?? entry.value ?? 0) || 0,
          }))
        : [];
      items.push({ keyword, aiSearchVolume: aiVolume, aiMonthlySearches: monthly });
    });
  });

  const unique = [];
  const seen = new Set();
  items.forEach((item) => {
    const key = item.keyword.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(item);
  });

  return { items: unique.slice(0, cap), location: normalizedLocation };
};

// ---- LLM scraper / AI optimization insights ----
async function fetchDataForSeoAiOptimization(
  { keywords, location_code, language_code, force_web_search = true },
  creds = {},
  cap = 10,
) {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return { results: [], notes: [] };
  }
  const fetcher = await ensureFetch();
  const tasks = keywords.slice(0, cap).map((keyword, index) => ({
    keyword,
    location_code: Number(location_code) || DEFAULT_LOCATION_CONFIG.location_code,
    language_code: language_code || DEFAULT_LOCATION_CONFIG.language_code,
    force_web_search: force_web_search !== false,
    tag: index,
  }));

  const response = await fetcher(ENDPOINTS.LLM_SCRAPER, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString('base64')}`,
    },
    body: JSON.stringify(tasks),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DataForSEO LLM scraper failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const payload = await response.json();
  if (payload.status_code && payload.status_code !== 20000) {
    throw new Error(payload.status_message || 'DataForSEO LLM scraper error');
  }

  const results = [];
  const notes = [];

  const taskMap = new Map();
  (payload.tasks || []).forEach((task, index) => {
    const key = typeof task.tag === 'number' ? task.tag : index;
    taskMap.set(key, task);
  });

  tasks.forEach((task, index) => {
    const source = taskMap.get(index);
    if (!source) {
      results.push({
        keyword: task.keyword,
        status: 'error',
        markdown: '',
        model: '',
        checkUrl: '',
        items: [],
      });
      notes.push(`${task.keyword}: Missing task result from DataForSEO.`);
      return;
    }

    if (source.status_code && source.status_code !== 20000) {
      const message = source.status_message || 'Task failed.';
      results.push({
        keyword: task.keyword,
        status: 'error',
        markdown: '',
        model: '',
        checkUrl: '',
        items: [],
      });
      notes.push(`${task.keyword}: ${message}`);
      return;
    }

    const resBlock =
      source.result && Array.isArray(source.result) && source.result.length
        ? source.result[0]
        : {};

    const sources = Array.isArray(resBlock.sources) ? resBlock.sources : [];
    const brandEntities = Array.isArray(resBlock.brand_entities)
      ? resBlock.brand_entities
      : Array.isArray(resBlock.brandEntities)
        ? resBlock.brandEntities
        : [];
    const fanOutQueries = Array.isArray(resBlock.fan_out_queries)
      ? resBlock.fan_out_queries
      : Array.isArray(resBlock.fanOutQueries)
        ? resBlock.fanOutQueries
        : [];
    const items = Array.isArray(resBlock.items)
      ? resBlock.items.map((item) => ({
          type: item.type || 'chat_gpt_text',
          markdown: item.markdown || '',
          rankGroup: item.rank_group ?? null,
          rankAbsolute: item.rank_absolute ?? null,
        }))
      : [];

    results.push({
      keyword: resBlock.keyword || task.keyword,
      location_code: resBlock.location_code || task.location_code,
      language_code: resBlock.language_code || task.language_code,
      model: resBlock.model || '',
      checkUrl: resBlock.check_url || '',
      datetime: resBlock.datetime || null,
      se_results_count: resBlock.se_results_count ?? null,
      sources,
      fan_out_queries: fanOutQueries,
      brand_entities: brandEntities,
      markdown: resBlock.markdown || items[0]?.markdown || '',
      items,
    });
  });

  return { results, notes };
}

// =========================================================================
// On-Page API (async crawl + live single-page inspection)
// =========================================================================

async function postOnPageTask({ target, maxCrawlPages = 100, enableJavascript = false }, creds) {
  if (!target) throw new Error('postOnPageTask: target is required');
  const payload = [
    {
      target,
      max_crawl_pages: Math.min(Math.max(1, maxCrawlPages), 1000),
      load_resources: true,
      enable_javascript: Boolean(enableJavascript),
      enable_browser_rendering: Boolean(enableJavascript),
      custom_js: '',
      respect_sitemap: true,
      crawl_sitemap_only: false,
    },
  ];
  const task = await performTask(ENDPOINTS.ONPAGE_TASK_POST, payload, creds);
  return task.id;
}

async function isOnPageTaskReady(taskId, creds) {
  const fetcher = await ensureFetch();
  const authHeader = `Basic ${Buffer.from(`${creds.login}:${creds.password}`).toString('base64')}`;
  const response = await fetcher(ENDPOINTS.ONPAGE_TASKS_READY, {
    method: 'GET',
    headers: { Authorization: authHeader },
  });
  if (!response.ok) return false;
  const data = await response.json().catch(() => ({}));
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const result = tasks[0]?.result || [];
  return result.some((entry) => entry?.id === taskId);
}

async function fetchOnPageSummary(taskId, creds) {
  const task = await performTask(ENDPOINTS.ONPAGE_SUMMARY, [{ id: taskId }], creds);
  return task?.result?.[0] || null;
}

async function fetchOnPagePages(taskId, creds, { limit = 1000, offset = 0 } = {}) {
  const payload = [{ id: taskId, limit, offset }];
  const task = await performTask(ENDPOINTS.ONPAGE_PAGES, payload, creds);
  return task?.result?.[0]?.items || [];
}

async function fetchOnPageLinks(taskId, creds, { limit = 1000, offset = 0 } = {}) {
  const payload = [{ id: taskId, limit, offset }];
  const task = await performTask(ENDPOINTS.ONPAGE_LINKS, payload, creds);
  return task?.result?.[0]?.items || [];
}

async function fetchOnPageDuplicateContent(taskId, creds, { limit = 200 } = {}) {
  const payload = [{ id: taskId, limit }];
  const task = await performTask(ENDPOINTS.ONPAGE_DUPLICATE_CONTENT, payload, creds);
  return task?.result?.[0]?.items || [];
}

async function fetchOnPageDuplicateTags(taskId, creds, { limit = 200, type = 'title' } = {}) {
  const payload = [{ id: taskId, limit, type }];
  const task = await performTask(ENDPOINTS.ONPAGE_DUPLICATE_TAGS, payload, creds);
  return task?.result?.[0]?.items || [];
}

async function fetchInstantPage({ url, enableJavascript = false }, creds) {
  const payload = [
    {
      url,
      enable_javascript: Boolean(enableJavascript),
      enable_browser_rendering: Boolean(enableJavascript),
      load_resources: true,
      custom_js: '',
    },
  ];
  const task = await performTask(ENDPOINTS.ONPAGE_INSTANT_PAGES, payload, creds);
  return task?.result?.[0]?.items?.[0] || null;
}

// =========================================================================
// Lighthouse (live, mobile-first by spec)
// =========================================================================
async function fetchLighthouse({ url, strategy = 'mobile', categories = ['performance', 'accessibility', 'best-practices', 'seo'] }, creds) {
  const payload = [
    {
      url,
      for_mobile: strategy === 'mobile',
      categories,
    },
  ];
  const task = await performTask(ENDPOINTS.LIGHTHOUSE_LIVE, payload, creds);
  const lh = task?.result?.[0]?.lighthouse || task?.result?.[0] || null;
  if (!lh) return null;
  const cats = lh.categories || {};
  const scores = {
    performance: cats.performance?.score ?? null,
    accessibility: cats.accessibility?.score ?? null,
    bestPractices: cats['best-practices']?.score ?? null,
    seo: cats.seo?.score ?? null,
  };
  const audits = lh.audits || {};
  const pick = (id) => audits[id] || null;
  return {
    scores,
    metrics: {
      lcp: pick('largest-contentful-paint')?.numericValue ?? null,
      cls: pick('cumulative-layout-shift')?.numericValue ?? null,
      inp: pick('experimental-interaction-to-next-paint')?.numericValue ?? null,
      tbt: pick('total-blocking-time')?.numericValue ?? null,
      fcp: pick('first-contentful-paint')?.numericValue ?? null,
      tti: pick('interactive')?.numericValue ?? null,
    },
    mobileFriendly: {
      viewport: pick('viewport')?.score === 1,
      tapTargets: pick('tap-targets')?.score === 1,
      fontSize: pick('font-size')?.score === 1,
      contentWidth: pick('content-width')?.score === 1,
    },
    raw: lh,
  };
}

// =========================================================================
// Labs (Ranked Keywords, Keyword Ideas, Competitors, Domain Intersection)
// =========================================================================
async function fetchLabsRankedKeywords({ target, location_code, language_code, limit = 100 }, creds) {
  const payload = [
    {
      target,
      location_code: Number(location_code) || DEFAULT_LOCATION_CONFIG.location_code,
      language_code: language_code || DEFAULT_LOCATION_CONFIG.language_code,
      limit: Math.min(limit, 1000),
      ignore_synonyms: false,
    },
  ];
  const task = await performTask(ENDPOINTS.LABS_RANKED_KEYWORDS, payload, creds);
  return task?.result?.[0]?.items || [];
}

async function fetchLabsKeywordIdeas({ keywords, location_code, language_code, limit = 200 }, creds) {
  const payload = [
    {
      keywords,
      location_code: Number(location_code) || DEFAULT_LOCATION_CONFIG.location_code,
      language_code: language_code || DEFAULT_LOCATION_CONFIG.language_code,
      limit: Math.min(limit, 1000),
      ignore_synonyms: false,
    },
  ];
  const task = await performTask(ENDPOINTS.LABS_KEYWORD_IDEAS, payload, creds);
  return task?.result?.[0]?.items || [];
}

async function fetchLabsCompetitorsDomain({ target, location_code, language_code, limit = 20 }, creds) {
  const payload = [
    {
      target,
      location_code: Number(location_code) || DEFAULT_LOCATION_CONFIG.location_code,
      language_code: language_code || DEFAULT_LOCATION_CONFIG.language_code,
      limit: Math.min(limit, 100),
    },
  ];
  const task = await performTask(ENDPOINTS.LABS_COMPETITORS_DOMAIN, payload, creds);
  return task?.result?.[0]?.items || [];
}

async function fetchLabsDomainIntersection({ target1, target2, location_code, language_code, limit = 100, intersection_mode = 'difference' }, creds) {
  const payload = [
    {
      target1,
      target2,
      location_code: Number(location_code) || DEFAULT_LOCATION_CONFIG.location_code,
      language_code: language_code || DEFAULT_LOCATION_CONFIG.language_code,
      limit: Math.min(limit, 1000),
      intersection_mode,
    },
  ];
  const task = await performTask(ENDPOINTS.LABS_DOMAIN_INTERSECTION, payload, creds);
  return task?.result?.[0]?.items || [];
}

module.exports = {
  ENDPOINTS,
  DATAFORSEO_LOCATIONS_LIMIT,
  DEFAULT_LOCATION_KEY,
  DEFAULT_LOCATION_CONFIG,
  GEO_LOCATION_MAP,
  LANGUAGE_BY_COUNTRY,
  COUNTRY_NORMALIZATION_MAP,
  normalizeCountryCode,
  normalizeLanguageCode,
  inferLanguageFromCountry,
  buildFallbackLocationList,
  filterFallbackLocations,
  getGeoTargetsForKey,
  buildLocationSettings,
  resolveCredentials,
  getUserDataForSeoCredentials,
  performTask,
  performDataForSeoTask: performTask,
  dollarsToMicros,
  normalizeCompetition,
  fetchDataForSeoLocations,
  fetchDataForSeoKeywordIdeas,
  fetchDataForSeoKeywordVolume,
  fetchDataForSeoAiKeywordData,
  fetchDataForSeoAiOptimization,
  // On-Page + Lighthouse + Labs (added for AI Assistant)
  postOnPageTask,
  isOnPageTaskReady,
  fetchOnPageSummary,
  fetchOnPagePages,
  fetchOnPageLinks,
  fetchOnPageDuplicateContent,
  fetchOnPageDuplicateTags,
  fetchInstantPage,
  fetchLighthouse,
  fetchLabsRankedKeywords,
  fetchLabsKeywordIdeas,
  fetchLabsCompetitorsDomain,
  fetchLabsDomainIntersection,
};
