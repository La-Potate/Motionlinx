'use strict';

const logger = require('../utils/logger');
const { dbRun } = require('../utils/dbAsync');

async function logApiRequest(
  userId,
  service,
  credits = 1,
  meta = {},
  success = true,
  statusCode = null,
  errorMessage = '',
) {
  try {
    await dbRun(
      `INSERT INTO api_request_logs (user_id, service, credits, meta, success, status_code, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || 0,
        service,
        credits || 1,
        JSON.stringify(meta || {}),
        success ? 1 : 0,
        statusCode || null,
        errorMessage || null,
      ],
    );
  } catch (err) {
    logger.error({ err }, 'Failed to log API request');
  }
}

module.exports = { logApiRequest };
