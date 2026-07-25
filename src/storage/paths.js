'use strict';

const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const logger = require('../utils/logger');

const permissionWarnings = new Set();

function ensureDir(dirPath, permissions = 0o700) {
  try {
    fs.mkdirSync(dirPath, { recursive: true, mode: permissions });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  if (permissions && process.platform !== 'win32') {
    try {
      fs.chmodSync(dirPath, permissions);
    } catch (chmodError) {
      const key = `${dirPath}:${chmodError.code}`;
      if (!permissionWarnings.has(key)) {
        logger.warn(`[storage] Unable to set permissions on ${dirPath}: ${chmodError.message}`);
        permissionWarnings.add(key);
      }
    }
  }
}

function copyDirectoryRecursive(source, target) {
  if (!source || !fs.existsSync(source)) return;
  ensureDir(target);
  if (typeof fs.cpSync === 'function') {
    fs.cpSync(source, target, { recursive: true, errorOnExist: false, force: false });
    return;
  }
  fs.readdirSync(source, { withFileTypes: true }).forEach((entry) => {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  });
}

function maybeMigrateLegacyUserdata(legacyPath, targetPath) {
  if (!legacyPath || legacyPath === targetPath) return;
  if (!fs.existsSync(legacyPath)) return;
  const legacyDb = path.join(legacyPath, 'database.sqlite');
  if (!fs.existsSync(legacyDb)) return;
  const destinationDb = path.join(targetPath, 'database.sqlite');
  if (fs.existsSync(destinationDb)) return;
  logger.info(`[storage] Detected legacy user data at ${legacyPath}. Copying into ${targetPath}...`);
  copyDirectoryRecursive(legacyPath, targetPath);
  logger.info('[storage] Legacy user data copied into the persistent storage directory.');
}

// Server root is the repo root (parent of src/).
const SERVER_ROOT = path.resolve(path.join(__dirname, '..', '..'));

// Default falls back to an `app-data` folder next to the server source.
const DEFAULT_USERDATA_ROOT = path.resolve(path.join(SERVER_ROOT, 'app-data'));
const USERDATA_ROOT = path.resolve(env.USERDATA_PATH || DEFAULT_USERDATA_ROOT);
ensureDir(USERDATA_ROOT);

// Skip the legacy auto-copy in test mode — tests want a truly fresh data dir.
// In production/dev, the copy still runs once on first boot to ease upgrades.
const LEGACY_USERDATA_PATH = path.resolve(env.LEGACY_USERDATA_PATH || DEFAULT_USERDATA_ROOT);
if (env.NODE_ENV !== 'test') {
  maybeMigrateLegacyUserdata(LEGACY_USERDATA_PATH, USERDATA_ROOT);
}
logger.info(`[storage] User data directory: ${USERDATA_ROOT}`);

const USER_FILES_ROOT = path.join(USERDATA_ROOT, 'users');
ensureDir(USER_FILES_ROOT);

// System config and user data share the same root. SYSTEM_DATA_ROOT is kept as a
// distinct constant for callers that semantically want "the system area," but it
// resolves to USERDATA_ROOT so existing on-disk files (e.g. system-settings.json)
// keep working.
const SYSTEM_DATA_ROOT = USERDATA_ROOT;
const SYSTEM_SETTINGS_FILE = path.join(SYSTEM_DATA_ROOT, 'system-settings.json');

// Legacy: until 2026-05-27 this was a single global file shared across every
// user (cross-user data leak). Kept exported only so future migration code can
// reference it; nothing reads/writes through it anymore.
const LEGACY_GBA_HISTORY_FILE = path.join(USERDATA_ROOT, 'gba-history.json');

const DB_PATH = path.join(USERDATA_ROOT, 'database.sqlite');

function getUserDir(userId) {
  const dir = path.join(USER_FILES_ROOT, String(userId));
  ensureDir(dir);
  return dir;
}

function getUserSubDir(userId, sub) {
  const dir = path.join(getUserDir(userId), sub);
  ensureDir(dir);
  return dir;
}

/** Per-user GBA history JSON path. Created on first write. */
function getUserGbaHistoryFile(userId) {
  return path.join(getUserDir(userId), 'gba-history.json');
}

module.exports = {
  ensureDir,
  copyDirectoryRecursive,
  maybeMigrateLegacyUserdata,
  SERVER_ROOT,
  USERDATA_ROOT,
  USER_FILES_ROOT,
  SYSTEM_DATA_ROOT,
  SYSTEM_SETTINGS_FILE,
  LEGACY_GBA_HISTORY_FILE,
  DB_PATH,
  getUserDir,
  getUserSubDir,
  getUserGbaHistoryFile,
};
