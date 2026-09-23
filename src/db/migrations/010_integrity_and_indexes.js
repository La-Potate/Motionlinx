'use strict';

/**
 * Data-integrity and index fixes from the production audit (docs/PRODUCTION-AUDIT.md).
 *
 * A JS migration because the first step has to reconcile existing data before
 * a constraint can be added.
 *
 * A-13  user_bans had no uniqueness on user_id, so duplicate bans were
 *       insertable until the route started answering 409 on 2026-09-13. Any
 *       duplicate that already exists doubles that user's row in the admin
 *       user list (LEFT JOIN). Keep the earliest ban per user, then enforce
 *       uniqueness. The non-unique index from 009 becomes redundant.
 *
 * A-02  stripe_webhook_events records every Stripe event id we have acted on,
 *       so a redelivered event is acknowledged without being processed again.
 *       Before this, a retried checkout.session.completed granted a credit
 *       top-up a second time.
 *
 * A-07  Indexes for lookups that ran as full scans: the refresh-token hash on
 *       every /auth/refresh and /logout, the API request log the admin panel
 *       filters and sorts, and the user_id column on five user-scoped tables
 *       that every list route filters by.
 */
async function up({ dbRun }) {
  // ---- A-13: one ban row per user ----
  await dbRun(
    'DELETE FROM user_bans WHERE id NOT IN (SELECT MIN(id) FROM user_bans GROUP BY user_id)',
  );
  await dbRun('DROP INDEX IF EXISTS idx_user_bans_user_id');
  await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_bans_user ON user_bans(user_id)');

  // ---- A-02: webhook idempotency ----
  await dbRun(`
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ---- A-07: hot-path indexes ----
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)',
    'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)',
    'CREATE INDEX IF NOT EXISTS idx_api_request_logs_user_created ON api_request_logs(user_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON api_request_logs(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_heatmap_reports_user ON heatmap_reports(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_businesses_user ON businesses(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_business_entities_user ON business_entities(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_press_releases_user ON press_releases(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_blog_posts_user ON blog_posts(user_id)',
  ];
  for (const sql of indexes) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(sql);
  }
}

module.exports = { up };
