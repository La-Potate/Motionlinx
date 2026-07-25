'use strict';

const logger = require('../utils/logger');
const { db } = require('../utils/dbAsync');
const { normalizeHostname } = require('../utils/url');
const {
  getUserGoogleSearchConfig,
  fetchGoogleSearchRank,
} = require('../integrations/googleCustomSearch');

/**
 * Refresh a single keyword's tracked position. Loads the keyword + business
 * row, calls Google Custom Search, writes a ranking_history record, and
 * updates `last_position` / `best_position` / `worst_position` on the keyword.
 */
function refreshKeywordPosition({
  keywordId,
  userId,
  overrideTarget,
  overrideCountry,
  overrideLanguage,
  overrideDevice,
  maxResults = 50,
}) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT k.*, b.website as business_website, b.name as business_name
       FROM keywords k
       JOIN businesses b ON b.id = k.business_id
       WHERE k.id = ? AND b.user_id = ?`,
      [keywordId, userId],
      async (err, keywordRow) => {
        if (err) {
          logger.error({ err }, 'Failed to load keyword for refresh');
          return reject(new Error('Failed to load keyword'));
        }
        if (!keywordRow) return reject(new Error('Keyword not found or access denied'));

        try {
          const { apiKey, cx } = await getUserGoogleSearchConfig(userId);
          if (!apiKey || !cx) {
            throw new Error(
              'Google API credentials missing. Please add them in Settings > Saved APIs.',
            );
          }
          const targetSource =
            overrideTarget || keywordRow.target_url || keywordRow.business_website;
          const targetHost = normalizeHostname(targetSource);
          if (!targetHost) {
            throw new Error('Keyword is missing a target website or business website.');
          }

          const country = (overrideCountry || keywordRow.country || '').trim();
          const language = (overrideLanguage || keywordRow.language || '').trim();
          const device = (overrideDevice || keywordRow.device || 'desktop').trim().toLowerCase();

          const { position, snapshot } = await fetchGoogleSearchRank({
            keyword: keywordRow.keyword,
            targetHost,
            apiKey,
            cx,
            country,
            language,
            maxResults,
          });

          const timestamp = new Date();
          const dateStr = timestamp.toISOString().split('T')[0];
          const numericPosition = typeof position === 'number' ? position : null;
          const historyPosition = numericPosition === null ? 0 : numericPosition;

          db.run(
            `INSERT INTO ranking_history (keyword_id, position, search_engine, location, device, date)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [keywordId, historyPosition, 'google', country || null, device || null, dateStr],
            (historyErr) => {
              if (historyErr) logger.error({ err: historyErr }, 'Failed to insert ranking history');
            },
          );

          const previousBest =
            keywordRow.best_position && keywordRow.best_position > 0
              ? keywordRow.best_position
              : null;
          const previousWorst =
            keywordRow.worst_position && keywordRow.worst_position > 0
              ? keywordRow.worst_position
              : null;

          const nextBest =
            numericPosition && numericPosition > 0
              ? !previousBest || numericPosition < previousBest
                ? numericPosition
                : previousBest
              : previousBest;
          const nextWorst =
            numericPosition && numericPosition > 0
              ? !previousWorst || numericPosition > previousWorst
                ? numericPosition
                : previousWorst
              : previousWorst;

          db.run(
            `UPDATE keywords
             SET last_position = ?, best_position = ?, worst_position = ?, last_checked_at = ?,
                 status = ?, last_snapshot = ?, country = COALESCE(country, ?),
                 language = COALESCE(language, ?), device = COALESCE(device, ?)
             WHERE id = ?`,
            [
              numericPosition,
              nextBest || null,
              nextWorst || null,
              timestamp.toISOString(),
              numericPosition ? 'tracked' : 'not_found',
              JSON.stringify(snapshot.slice(0, 20)),
              country || null,
              language || null,
              device || 'desktop',
              keywordId,
            ],
            (updateErr) => {
              if (updateErr) {
                logger.error({ err: updateErr }, 'Failed to update keyword after refresh');
                return reject(new Error('Failed to update keyword with new ranking'));
              }
              db.get('SELECT * FROM keywords WHERE id = ?', [keywordId], (loadErr, freshKeyword) => {
                if (loadErr || !freshKeyword) {
                  logger.error({ err: loadErr }, 'Failed to load keyword after refresh');
                  return reject(new Error('Failed to load keyword after refresh'));
                }
                resolve({ keyword: freshKeyword, snapshot, position: numericPosition });
              });
            },
          );
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

module.exports = { refreshKeywordPosition };
