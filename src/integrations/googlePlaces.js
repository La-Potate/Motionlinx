'use strict';

const logger = require('../utils/logger');
const { dbAll } = require('../utils/dbAsync');
const { readUserApiKeysFromDisk } = require('../storage/userSettings');
const { decryptSecret } = require('../utils/crypto');
const { ensureFetch } = require('../utils/smartFetch');

/**
 * Resolve a user's saved Google Places API key. Reads from the `user_settings`
 * table first (canonical store), falls back to the per-user settings.json on
 * disk (legacy / robustness against DB issues), checks both the dedicated
 * `googlePlaces_api_key` and the general `google_api_key`.
 */
async function getUserGooglePlacesKey(userId) {
  try {
    const rows = await dbAll(
      `SELECT setting_key, setting_value FROM user_settings
       WHERE user_id = ? AND setting_key IN ('googlePlaces_api_key', 'google_api_key')`,
      [userId],
    );
    let placesKey = '';
    let generalKey = '';
    rows.forEach((row) => {
      if (row.setting_key === 'googlePlaces_api_key' && row.setting_value) {
        placesKey = decryptSecret(row.setting_value) || '';
      }
      if (row.setting_key === 'google_api_key' && row.setting_value) {
        generalKey = decryptSecret(row.setting_value) || '';
      }
    });
    if (placesKey) return placesKey;
    if (generalKey) return generalKey;
  } catch (err) {
    logger.warn({ err }, 'getUserGooglePlacesKey DB lookup failed; falling back to disk');
  }
  const disk = readUserApiKeysFromDisk(userId);
  return disk.googlePlaces || disk.googleApiKey || '';
}

async function placesTextSearch({ query, lat, lng, radius, apiKey }) {
  const fetcher = await ensureFetch();
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', query);
  if (lat && lng) {
    url.searchParams.set('location', `${lat},${lng}`);
    if (radius) url.searchParams.set('radius', String(radius));
  }
  url.searchParams.set('key', apiKey);
  const resp = await fetcher(url.toString());
  return resp.json();
}

async function placeDetails({ placeId, fields, apiKey }) {
  const fetcher = await ensureFetch();
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  if (fields) url.searchParams.set('fields', fields);
  url.searchParams.set('key', apiKey);
  const resp = await fetcher(url.toString());
  return resp.json();
}

module.exports = {
  getUserGooglePlacesKey,
  placesTextSearch,
  placeDetails,
};
