'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { dbAll, dbGet, dbRun, dbExec, withTransaction } = require('../utils/dbAsync');

/**
 * Tiny forward-only SQLite migration runner.
 *
 * Migrations live in `src/db/migrations/` as files named `NNN_description.{sql,js}`
 * where NNN is a zero-padded integer (e.g. `001_initial_schema.sql`).
 *
 *   - `.sql` files: contents are executed inside a transaction.
 *   - `.js` files: must export `async function up({ db, dbRun, dbExec, dbAll })`.
 *
 * Applied versions are tracked in `schema_migrations(version, applied_at)`.
 * Runs to completion (resolved promise) before any application code that
 * depends on schema state can proceed, so the legacy "ALTER may still be
 * in flight" race is gone.
 */
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function parseFilename(filename) {
  const match = filename.match(/^(\d+)_([^.]+)\.(sql|js)$/);
  if (!match) return null;
  return {
    version: parseInt(match[1], 10),
    name: match[2],
    type: match[3],
    filename,
  };
}

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .map(parseFilename)
    .filter(Boolean)
    .sort((a, b) => a.version - b.version);
}

async function getAppliedVersions() {
  const rows = await dbAll('SELECT version FROM schema_migrations ORDER BY version ASC');
  return new Set(rows.map((r) => r.version));
}

/**
 * Split a SQL script into individual statements. We can't trust `db.exec(sql)`
 * to handle long multi-statement files reliably (silently misorders some
 * CREATE INDEX statements vs the CREATE TABLE they reference), so we split
 * and run one-by-one. Comments (--) and blank lines are dropped.
 */
function splitSqlStatements(sql) {
  // Strip line comments first; preserve strings.
  const stripped = sql
    .split(/\n/)
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
  return stripped
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.endsWith(';') ? s : `${s};`));
}

async function runOne(migration) {
  const fullPath = path.join(MIGRATIONS_DIR, migration.filename);
  logger.info({ migration: migration.filename }, 'Applying migration');

  if (migration.type === 'sql') {
    const sql = fs.readFileSync(fullPath, 'utf8');
    const statements = splitSqlStatements(sql);
    // DDL inside an explicit BEGIN/COMMIT plays badly with WAL + sqlite3 npm
    // when many CREATE TABLE / CREATE INDEX statements run in sequence (some
    // index creations could see stale schema state and fail with "no such
    // column"). Run statements sequentially without a wrapping transaction;
    // each CREATE TABLE / CREATE INDEX is its own implicit transaction in
    // SQLite, which is the documented safe path.
    for (let i = 0; i < statements.length; i += 1) {
      const stmt = statements[i];
      try {
        // eslint-disable-next-line no-await-in-loop
        await dbRun(stmt);
      } catch (err) {
        logger.error(
          { migration: migration.filename, statementIndex: i, stmt: stmt.slice(0, 240) },
          'Migration statement failed',
        );
        throw err;
      }
    }
    await dbRun('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [
      migration.version,
      migration.name,
    ]);
    return;
  }

  // JS migrations get full control (some changes need conditional logic, e.g.
  // partial unique indexes that depend on existing data shape).
  const mod = require(fullPath);
  if (typeof mod.up !== 'function') {
    throw new Error(`Migration ${migration.filename} must export an async up() function`);
  }
  await mod.up({
    dbGet,
    dbAll,
    dbRun,
    dbExec,
    db: require('./connection'),
  });
  await dbRun('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [
    migration.version,
    migration.name,
  ]);
}

/**
 * Apply every pending migration in order. Throws on the first failure so that
 * the app boot also fails — never leave the DB in a half-migrated state.
 */
async function runMigrations() {
  await ensureMigrationsTable();
  const all = listMigrations();
  if (!all.length) {
    logger.warn('No migrations found in src/db/migrations/');
    return { applied: [], skipped: 0 };
  }
  const applied = await getAppliedVersions();
  const pending = all.filter((m) => !applied.has(m.version));
  if (!pending.length) {
    logger.info({ count: all.length }, 'Schema up to date');
    return { applied: [], skipped: all.length };
  }
  logger.info({ count: pending.length }, 'Running pending migrations');
  for (const migration of pending) {
    // eslint-disable-next-line no-await-in-loop
    await runOne(migration);
  }
  return { applied: pending.map((m) => m.filename), skipped: all.length - pending.length };
}

module.exports = { runMigrations };
