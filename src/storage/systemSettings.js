'use strict';

const fs = require('fs');
const logger = require('../utils/logger');
const mergeDeep = require('../utils/mergeDeep');
const { encryptSecret, decryptSecret } = require('../utils/crypto');
const { ensureDir, SYSTEM_DATA_ROOT, SYSTEM_SETTINGS_FILE } = require('./paths');

// Setting keys (under settings.apiKeys.*) that hold secrets and should be
// encrypted at rest when MASTER_KEY is configured.
const SYSTEM_SECRET_KEYS = new Set([
  'serper',
  'claude',
  'googlePlaces',
  'googleApiKey',
  'googleCx',
  'dataForSeo',
  'dataForSeoLogin',
  'dataForSeoPassword',
  'googleOauthClientId',
  'googleOauthClientSecret',
]);

const DEFAULT_BLOG_POST_PROMPT = `You are an expert SEO content writer. Your task is to write a comprehensive, engaging blog post based on the provided website, topic/keyword, and target word count.

Instructions:
1. Research the website to understand the business, brand voice, and target audience.
2. Write a blog post that is informative, engaging, and optimized for the given topic/keyword.
3. Include an attention-grabbing title, introduction, well-structured body with subheadings, and a compelling conclusion.
4. Naturally incorporate the keyword throughout the content without keyword stuffing.
5. Write in a professional yet conversational tone that matches the website's brand.
6. Include a call-to-action at the end.

Format:
- Title (SEO-optimized, compelling)
- Introduction (hook the reader)
- Body (3-5 sections with H2 subheadings)
- Conclusion (summarize key points)
- Call-to-Action

The user will provide: Website URL, Word Count, and Topic/Keyword.`;

function getDefaultSystemSettings() {
  const now = new Date().toISOString();
  return {
    apiKeys: {},
    prompts: { blogPost: DEFAULT_BLOG_POST_PROMPT },
    createdAt: now,
    updatedAt: now,
  };
}

function readSystemSettings() {
  try {
    ensureDir(SYSTEM_DATA_ROOT, 0o700);
    if (!fs.existsSync(SYSTEM_SETTINGS_FILE)) {
      const base = getDefaultSystemSettings();
      fs.writeFileSync(SYSTEM_SETTINGS_FILE, JSON.stringify(base, null, 2));
      return base;
    }
    const content = fs.readFileSync(SYSTEM_SETTINGS_FILE, 'utf8');
    const parsed = content ? JSON.parse(content) : {};
    const merged = mergeDeep(getDefaultSystemSettings(), parsed);
    if (!merged.updatedAt) merged.updatedAt = merged.createdAt;
    return merged;
  } catch (err) {
    logger.error({ err }, 'Failed to read system settings');
    const fallback = getDefaultSystemSettings();
    try {
      fs.writeFileSync(SYSTEM_SETTINGS_FILE, JSON.stringify(fallback, null, 2));
    } catch (_) {
      // ignore secondary failure
    }
    return fallback;
  }
}

function writeSystemSettings(payload = {}) {
  const current = readSystemSettings();
  const merged = mergeDeep(current, payload);
  const now = new Date().toISOString();
  if (!merged.createdAt) merged.createdAt = now;
  merged.updatedAt = now;
  fs.writeFileSync(SYSTEM_SETTINGS_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

function getSystemApiKey(key) {
  const settings = readSystemSettings();
  const apiKeys = settings.apiKeys && typeof settings.apiKeys === 'object' ? settings.apiKeys : {};
  const raw = apiKeys[key] || '';
  // Auto-decrypt if encrypted (and a no-op for plaintext / unset values).
  return SYSTEM_SECRET_KEYS.has(key) ? decryptSecret(raw) || '' : raw;
}

function setSystemApiKey(key, value) {
  if (!key) return;
  const current = readSystemSettings();
  const apiKeys = current.apiKeys && typeof current.apiKeys === 'object' ? current.apiKeys : {};
  if (value) {
    apiKeys[key] = SYSTEM_SECRET_KEYS.has(key) ? encryptSecret(value) : value;
  } else {
    delete apiKeys[key];
  }
  writeSystemSettings({ apiKeys });
}

module.exports = {
  getDefaultSystemSettings,
  readSystemSettings,
  writeSystemSettings,
  getSystemApiKey,
  setSystemApiKey,
};
