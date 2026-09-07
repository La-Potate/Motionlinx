'use strict';

const cors = require('cors');
const logger = require('../utils/logger');
const { CLIENT_ORIGIN, isProd } = require('./env');

/**
 * Build the CORS middleware. In production, only origins in CLIENT_ORIGIN
 * (comma-separated) are allowed. In development, all origins are allowed for
 * convenience.
 *
 * The env validator already refuses to boot if CLIENT_ORIGIN is missing in
 * production, so by the time we get here either we have a whitelist or we're
 * in dev mode.
 */
function buildCorsMiddleware() {
  if (!isProd) {
    logger.info('🔧 Development mode — CORS allows all origins');
    return cors({ origin: true, credentials: true });
  }

  const whitelist = CLIENT_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  logger.info({ whitelist }, '🔒 Production CORS whitelist active');

  return cors({
    origin(origin, callback) {
      // Allow same-origin/no-origin requests (curl, server-to-server, healthcheck).
      if (!origin) return callback(null, true);
      if (whitelist.includes(origin)) return callback(null, true);
      logger.warn({ origin }, 'CORS rejected origin');
      // Tagged so the error handler answers 403. Left untagged this surfaced
      // as a 500, which reads as an app fault in logs and alerting when it is
      // really just a request from an origin that is not allowed.
      const err = new Error('Not allowed by CORS');
      err.status = 403;
      return callback(err);
    },
    credentials: true,
  });
}

module.exports = { buildCorsMiddleware };
