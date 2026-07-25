'use strict';

const logger = require('../utils/logger');
const { dbGet } = require('../utils/dbAsync');
const { normalizeUserLevel } = require('../utils/userLevel');
const {
  applyCreditChange,
  ensurePlanCredits,
  getPlanForRole,
  OUT_OF_CREDITS_MESSAGE,
} = require('../services/credits');
const { logApiRequest } = require('../services/apiLog');

const CREDIT_EXEMPT_PREFIXES = [
  '/api/auth',
  '/api/admin',
  '/api/settings',
  '/api/profile',
  '/api/change-password',
  '/api/trial',
  '/api/billing',
  '/api/billing/webhook',
  '/api/health',
  '/api/site-marker/shared', // public share endpoint — auth + credit guard skipped
  // GA4 / AI Traffic Report: no credit cost (the cost is borne by the user's
  // own Google Analytics quota). The OAuth callback is reached via a browser
  // redirect with no JWT, so it MUST be exempt; routes/ga4.js re-applies
  // `authenticate` middleware to every other route after the callback.
  '/api/ga4',
  // GSC + AI Assistant: same exempt-from-credit pattern as GA4. Per-user
  // soft caps live in api_quota; the cost is borne by the user's own GSC +
  // DataForSEO quotas.
  '/api/gsc',
  '/api/ai-assistant',
];

function deriveServiceName(req) {
  const method = (req.method || 'GET').toUpperCase();
  const rawPath = req.originalUrl || req.path || '';
  const path = rawPath.split('?')[0];
  return `${method} ${path}`;
}

/**
 * Middleware factory. Verifies the user has credit before a paid endpoint runs;
 * deducts on success via a `res.on('finish')` hook. The deduction is best-effort
 * (the response has already been sent by the time it runs), but at least it
 * logs the API request either way.
 *
 * Future improvement: move deduction into a real transaction wrapper so the
 * deduction and response are atomic.
 */
function creditGuard(options = {}) {
  return async function creditGuardMiddleware(req, res, next) {
    try {
      const path = req.originalUrl || req.path || '';
      if (CREDIT_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
        return next();
      }

      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const dbUser = await dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
      if (!dbUser) {
        return res.status(401).json({ error: 'User not found' });
      }

      const hydrated = await ensurePlanCredits(dbUser);
      req.billingUser = hydrated;
      const normalizedRole = normalizeUserLevel(hydrated.role);
      if (normalizedRole === 'admin') return next();

      const plan = getPlanForRole(normalizedRole);
      const meta = res.locals.creditMeta || req.creditMeta || { path, method: req.method };
      const cost = res.locals.creditCost || req.creditCost || options.cost || 1;
      const service = options.service || req.creditService || deriveServiceName(req);
      res.locals.creditCost = cost;
      res.locals.creditService = service;

      const currentCredits = typeof hydrated.credits === 'number' ? hydrated.credits : 0;
      if (!plan) {
        await logApiRequest(req.user.id, service, cost, meta, false, 402, 'No active plan');
        return res.status(402).json({ error: OUT_OF_CREDITS_MESSAGE });
      }
      if (currentCredits < cost) {
        await logApiRequest(req.user.id, service, cost, meta, false, 402, OUT_OF_CREDITS_MESSAGE);
        return res.status(402).json({ error: OUT_OF_CREDITS_MESSAGE });
      }

      res.on('finish', async () => {
        try {
          if (req.disableAutoApiLog) return;
          const success = res.statusCode < 400;
          if (success && plan) {
            await applyCreditChange(req.user.id, -cost, 'usage', { service, path });
          }
          await logApiRequest(
            req.user.id,
            service,
            cost,
            meta,
            success,
            res.statusCode,
            success ? '' : `HTTP ${res.statusCode}`,
          );
        } catch (err) {
          logger.error({ err }, 'Credit guard post-processing failed');
        }
      });

      return next();
    } catch (err) {
      logger.error({ err }, 'Credit guard error');
      return res.status(500).json({ error: err.message || 'Credit validation failed' });
    }
  };
}

module.exports = creditGuard;
module.exports.creditGuard = creditGuard;
module.exports.CREDIT_EXEMPT_PREFIXES = CREDIT_EXEMPT_PREFIXES;
