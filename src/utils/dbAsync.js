'use strict';

const db = require('../db/connection');
const logger = require('./logger');

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbExec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

// Run a function inside a transaction. The function receives no arguments and
// can use dbGet/dbAll/dbRun normally.
async function withTransaction(fn) {
  await dbRun('BEGIN');
  try {
    const result = await fn();
    await dbRun('COMMIT');
    return result;
  } catch (err) {
    try {
      await dbRun('ROLLBACK');
    } catch (_) {
      // ignore rollback errors
    }
    throw err;
  }
}

/**
 * Ensure that optional columns exist on a table; add them if missing.
 * Returns a promise.
 */
async function ensureTableColumns(table, definitions = []) {
  if (!definitions.length) return;
  const columns = await dbAll(`PRAGMA table_info(${table})`);
  const existing = new Set(columns.map((col) => col.name));
  for (const { name, definition } of definitions) {
    if (existing.has(name)) continue;
    try {
      await dbRun(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    } catch (err) {
      // Some ALTERs (e.g. adding UNIQUE) are inherently unsupported on existing
      // SQLite tables; surface but don't crash schema-init.
      logger.warn({ table, column: name, err: err.message }, 'ALTER TABLE failed');
    }
  }
}

/**
 * True when an error is a UNIQUE-constraint violation.
 *
 * node-sqlite3 reports the generic `SQLITE_CONSTRAINT` code and puts the
 * specific constraint in the message — it does NOT emit the extended
 * `SQLITE_CONSTRAINT_UNIQUE` code that several handlers used to test for.
 * Those tests could never match, so duplicate signups surfaced as a blank
 * HTTP 500 instead of "Username or email already exists". Both spellings are
 * accepted here in case a future driver starts reporting the extended code.
 */
function isUniqueViolation(err) {
  if (!err) return false;
  const code = err.code || '';
  if (code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  if (code !== 'SQLITE_CONSTRAINT') return false;
  return /UNIQUE constraint failed/i.test(err.message || '');
}

module.exports = {
  db,
  dbGet,
  dbAll,
  dbRun,
  dbExec,
  withTransaction,
  ensureTableColumns,
  isUniqueViolation,
};
