'use strict';

const logger = require('../../utils/logger');

/**
 * Reconcile late-added columns on databases that were initialized by the
 * pre-migrations schema.js code. For a fresh DB, 001_initial_schema.sql
 * already created every table with every column, so this migration is a no-op.
 * For an existing DB, the legacy `ensureTableColumns(...)` calls may have
 * silently skipped some adds (notably `users.google_id` — the legacy code
 * tried `ADD COLUMN google_id TEXT UNIQUE`, which SQLite rejects, leaving the
 * column missing forever).
 *
 * This migration ensures every potentially-missing column exists, using a
 * non-UNIQUE definition. The accompanying partial unique INDEX (created in
 * 001) provides the uniqueness guarantee.
 */
const RECONCILIATIONS = {
  users: [
    { name: 'auth_provider', definition: "auth_provider TEXT DEFAULT 'local'" },
    { name: 'google_id', definition: 'google_id TEXT' },
    { name: 'email_verified', definition: 'email_verified BOOLEAN DEFAULT 0' },
    { name: 'avatar_url', definition: 'avatar_url TEXT' },
    { name: 'failed_logins', definition: 'failed_logins INTEGER DEFAULT 0' },
    { name: 'locked_until', definition: 'locked_until DATETIME' },
    { name: 'last_login', definition: 'last_login DATETIME' },
    { name: 'credits', definition: 'credits INTEGER DEFAULT 0' },
    { name: 'credits_refreshed_at', definition: 'credits_refreshed_at DATETIME' },
    { name: 'seat_count', definition: 'seat_count INTEGER DEFAULT 1' },
    { name: 'stripe_customer_id', definition: 'stripe_customer_id TEXT' },
    { name: 'stripe_subscription_id', definition: 'stripe_subscription_id TEXT' },
    { name: 'subscription_status', definition: "subscription_status TEXT DEFAULT 'inactive'" },
    { name: 'subscription_current_period_end', definition: 'subscription_current_period_end DATETIME' },
  ],
  tasks: [
    { name: 'priority', definition: "priority TEXT DEFAULT 'Low'" },
    { name: 'labels', definition: "labels TEXT DEFAULT ''" },
    { name: 'completed', definition: 'completed INTEGER DEFAULT 0' },
    { name: 'time_spent', definition: 'time_spent INTEGER DEFAULT 0' },
  ],
  keywords: [
    { name: 'target_url', definition: 'target_url TEXT' },
    { name: 'country', definition: 'country TEXT' },
    { name: 'language', definition: 'language TEXT' },
    { name: 'device', definition: "device TEXT DEFAULT 'desktop'" },
    { name: 'last_position', definition: 'last_position INTEGER' },
    { name: 'best_position', definition: 'best_position INTEGER' },
    { name: 'worst_position', definition: 'worst_position INTEGER' },
    { name: 'last_checked_at', definition: 'last_checked_at DATETIME' },
    { name: 'status', definition: "status TEXT DEFAULT 'idle'" },
    { name: 'notes', definition: 'notes TEXT' },
    { name: 'last_snapshot', definition: 'last_snapshot TEXT' },
  ],
  business_entities: [
    { name: 'business_id_slug', definition: 'business_id_slug TEXT' },
  ],
  api_request_logs: [
    { name: 'success', definition: 'success INTEGER DEFAULT 1' },
    { name: 'status_code', definition: 'status_code INTEGER' },
    { name: 'error_message', definition: 'error_message TEXT' },
  ],
  press_releases: [
    { name: 'status', definition: "status TEXT DEFAULT 'ready'" },
    { name: 'updated_at', definition: 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
  ],
  blog_posts: [
    { name: 'status', definition: "status TEXT DEFAULT 'ready'" },
    { name: 'updated_at', definition: 'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP' },
  ],
};

// Indexes that reference late-added columns. Created AFTER the column
// reconciliation above so they don't fail with "no such column" on legacy DBs.
const LATE_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_subscription ON users(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_business_entities_slug ON business_entities(business_id_slug) WHERE business_id_slug IS NOT NULL',
];

async function up({ dbAll, dbRun }) {
  for (const [table, columns] of Object.entries(RECONCILIATIONS)) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await dbAll(`PRAGMA table_info(${table})`).catch(() => []);
    if (!existing.length) continue; // Table doesn't exist yet — 001 should have created it.
    const have = new Set(existing.map((c) => c.name));
    for (const { name, definition } of columns) {
      if (have.has(name)) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await dbRun(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
        logger.info({ table, column: name }, 'Added missing column on legacy DB');
      } catch (err) {
        logger.warn({ table, column: name, err: err.message }, 'Failed to add column');
      }
    }
  }

  for (const stmt of LATE_INDEXES) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(stmt);
    } catch (err) {
      logger.warn({ stmt, err: err.message }, 'Failed to create late index');
    }
  }
}

module.exports = { up };
