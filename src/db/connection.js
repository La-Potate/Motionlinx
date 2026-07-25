'use strict';

const sqlite3 = require('sqlite3').verbose();
const logger = require('../utils/logger');
const { DB_PATH } = require('../storage/paths');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    logger.error({ err }, 'Error opening database');
    return;
  }
  logger.info({ path: DB_PATH }, 'Connected to SQLite database');
});

// Concurrency + integrity pragmas.
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA busy_timeout = 5000');
});

module.exports = db;
module.exports.DB_PATH = DB_PATH;
