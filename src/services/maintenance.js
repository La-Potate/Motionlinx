'use strict';

const logger = require('../utils/logger');
const { dbRun } = require('../utils/dbAsync');

/**
 * Periodic housekeeping for tables that otherwise grow without bound.
 *
 * - api_request_logs gets a row for every billable request and was never
 *   purged. On a NAS left running for a year that is a multi-million-row table
 *   the admin panel filters and sorts on every page load.
 * - refresh_tokens were only swept per-user, at that user's next login, so
 *   tokens for anyone who never came back accumulated forever.
 *
 * Runs once at startup and then daily. Deletions are bounded by index scans
 * (migration 010) and are safe to run concurrently with normal traffic.
 */
const API_LOG_RETENTION_DAYS = 90;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function runRetentionSweep() {
  // SQLite-side date arithmetic keeps the comparison in the same text format
  // the DEFAULT CURRENT_TIMESTAMP columns are written in.
  const logs = await dbRun(
    `DELETE FROM api_request_logs WHERE created_at < datetime('now', ?)`,
    [`-${API_LOG_RETENTION_DAYS} days`],
  );
  const tokens = await dbRun('DELETE FROM refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP');
  // Stripe retries a failed delivery for at most three days, so a claim older
  // than the log-retention window can never be needed for deduplication again.
  const events = await dbRun(
    `DELETE FROM stripe_webhook_events WHERE received_at < datetime('now', ?)`,
    [`-${API_LOG_RETENTION_DAYS} days`],
  );
  const summary = {
    apiLogsDeleted: logs.changes,
    refreshTokensDeleted: tokens.changes,
    stripeEventsDeleted: events.changes,
  };
  if (summary.apiLogsDeleted || summary.refreshTokensDeleted || summary.stripeEventsDeleted) {
    logger.info(summary, 'Retention sweep complete');
  }
  return summary;
}

let timer = null;

function scheduleRetentionSweep() {
  if (timer) return timer;
  runRetentionSweep().catch((err) => logger.warn({ err }, 'Startup retention sweep failed'));
  timer = setInterval(() => {
    runRetentionSweep().catch((err) => logger.warn({ err }, 'Retention sweep failed'));
  }, SWEEP_INTERVAL_MS);
  // Must not keep the process alive on its own during shutdown.
  timer.unref();
  return timer;
}

function stopRetentionSweep() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  API_LOG_RETENTION_DAYS,
  runRetentionSweep,
  scheduleRetentionSweep,
  stopRetentionSweep,
};
