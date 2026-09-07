'use strict';

const logger = require('../utils/logger');
const { dbAll } = require('../utils/dbAsync');
const { decryptSecret } = require('../utils/crypto');
const { readUserSettingsFromDisk } = require('../storage/userSettings');
const { getSystemApiKey } = require('../storage/systemSettings');
const env = require('../config/env');

/**
 * Bring-your-own-key resolution.
 *
 * Every service credential is looked up for the REQUESTING USER first, so each
 * account can supply its own keys and spend its own quota. A workspace key set
 * by an admin is only a fallback, and an env var only a last resort for
 * self-hosted installs that prefer to bake one in.
 *
 * Resolution order, per service:
 *   1. the user's own `user_settings` row  (source: 'user')
 *   2. that user's legacy settings.json    (source: 'user')
 *   3. the workspace key an admin shared   (source: 'workspace')
 *   4. an environment variable             (source: 'env')
 *
 * Returning the source alongside the value lets Settings tell someone whether
 * a tool is running on their key or the workspace's — without ever sending
 * them the key itself.
 */

/** service -> where to look at each level. */
const SERVICES = {
  serper: {
    userKeys: ['serper_api_key'],
    diskKeys: ['serper'],
    systemKey: 'serper',
    envKey: null,
    label: 'Serper',
  },
  claude: {
    userKeys: ['claude_api_key'],
    diskKeys: ['claude'],
    systemKey: 'claude',
    envKey: 'CLAUDE_API_KEY',
    label: 'Anthropic',
  },
  googleApiKey: {
    userKeys: ['google_api_key', 'googlePlaces_api_key'],
    diskKeys: ['googleApiKey', 'googlePlaces'],
    systemKey: null,
    envKey: null,
    label: 'Google API key',
  },
  googlePlaces: {
    // Places falls back to the general Google key, which is the same
    // credential with the Places API enabled.
    userKeys: ['googlePlaces_api_key', 'google_api_key'],
    diskKeys: ['googlePlaces', 'googleApiKey'],
    systemKey: null,
    envKey: null,
    label: 'Google Places',
  },
  googleCx: {
    userKeys: ['google_cx'],
    diskKeys: ['googleCx'],
    systemKey: null,
    envKey: null,
    label: 'Search Engine ID',
  },
  dataForSeoLogin: {
    userKeys: ['dataForSeo_login'],
    diskKeys: ['dataForSeoLogin'],
    systemKey: null,
    envKey: 'DATAFORSEO_LOGIN',
    label: 'DataForSEO login',
  },
  dataForSeoPassword: {
    userKeys: ['dataForSeo_password'],
    diskKeys: ['dataForSeoPassword'],
    systemKey: null,
    envKey: 'DATAFORSEO_PASSWORD',
    label: 'DataForSEO password',
  },
};

const ALL_USER_KEYS = [...new Set(Object.values(SERVICES).flatMap((s) => s.userKeys))];

/** Read and decrypt every stored key for one user in a single query. */
async function readUserKeys(userId) {
  if (!userId) return {};
  try {
    const rows = await dbAll(
      `SELECT setting_key, setting_value FROM user_settings
       WHERE user_id = ? AND setting_key IN (${ALL_USER_KEYS.map(() => '?').join(',')})`,
      [userId, ...ALL_USER_KEYS],
    );
    const out = {};
    rows.forEach((row) => {
      const raw = row.setting_value || '';
      // decryptSecret is a no-op on values stored before MASTER_KEY was set.
      out[row.setting_key] = decryptSecret(raw) || '';
    });
    return out;
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to read user API keys');
    return {};
  }
}

/**
 * Resolve one credential for a user.
 * @returns {Promise<{ value: string, source: 'user'|'workspace'|'env'|null }>}
 */
async function resolveApiKey(userId, service) {
  const def = SERVICES[service];
  if (!def) throw new Error(`Unknown API service: ${service}`);

  const userKeys = await readUserKeys(userId);
  for (const key of def.userKeys) {
    if (userKeys[key]) return { value: userKeys[key], source: 'user' };
  }

  const disk = readUserSettingsFromDisk(userId);
  for (const key of def.diskKeys) {
    const v = disk?.apiKeys?.[key];
    if (v) return { value: v, source: 'user' };
  }

  if (def.systemKey) {
    const v = getSystemApiKey(def.systemKey);
    if (v) return { value: v, source: 'workspace' };
  }

  if (def.envKey && env[def.envKey]) {
    return { value: env[def.envKey], source: 'env' };
  }

  return { value: '', source: null };
}

/** Convenience: just the value. */
async function getApiKey(userId, service) {
  return (await resolveApiKey(userId, service)).value;
}

/** DataForSEO needs both halves; returns '' for either when unset. */
async function getDataForSeoCredentials(userId) {
  const [login, password] = await Promise.all([
    resolveApiKey(userId, 'dataForSeoLogin'),
    resolveApiKey(userId, 'dataForSeoPassword'),
  ]);
  return {
    login: login.value,
    password: password.value,
    source: login.source || password.source,
  };
}

/**
 * Status for Settings: never the value, only whether it is set, a masked
 * hint, and whose key is in play.
 */
async function getKeyStatuses(userId) {
  const out = {};
  for (const service of Object.keys(SERVICES)) {
    // eslint-disable-next-line no-await-in-loop
    const { value, source } = await resolveApiKey(userId, service);
    out[service] = {
      configured: Boolean(value),
      masked: value ? maskKey(value) : '',
      source,
    };
  }
  return out;
}

/** Show enough to recognise a key, never enough to use it. */
function maskKey(value) {
  const s = String(value);
  if (s.length <= 8) return '••••';
  return `${'•'.repeat(4)}${s.slice(-4)}`;
}

module.exports = {
  SERVICES,
  resolveApiKey,
  getApiKey,
  getDataForSeoCredentials,
  getKeyStatuses,
  maskKey,
};
