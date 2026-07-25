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

module.exports = {
  db,
  dbGet,
  dbAll,
  dbRun,
  dbExec,
  withTransaction,
  ensureTableColumns,
};
