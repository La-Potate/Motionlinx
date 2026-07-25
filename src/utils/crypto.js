'use strict';

const crypto = require('crypto');
const logger = require('./logger');
const { MASTER_KEY, isProd } = require('../config/env');

/**
 * Encryption-at-rest for per-user secrets (API keys, etc.).
 *
 *   Format: enc:v1:<base64(iv|tag|ciphertext)>
 *   Cipher: AES-256-GCM
 *   Nonce:  12 random bytes per encryption
 *   Tag:    16 bytes appended
 *
 * If MASTER_KEY isn't set, the helpers degrade to plaintext (return inputs
 * unchanged) and a single startup warning is emitted. This keeps local dev
 * frictionless; production with sensitive credentials should always set it.
 *
 * Decryption is idempotent — calling decryptSecret() on plaintext returns the
 * input as-is. That means we can roll out gradually: turn on MASTER_KEY,
 * run migration 006 to convert existing rows, but old plaintext reads still
 * work in the interim.
 */

const ENC_PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

let masterKeyBuf = null;
let warnedNoKey = false;

function loadMasterKey() {
  if (masterKeyBuf) return masterKeyBuf;
  if (!MASTER_KEY) return null;
  try {
    const decoded = Buffer.from(MASTER_KEY, 'base64');
    if (decoded.length !== 32) {
      throw new Error(`MASTER_KEY must decode to exactly 32 bytes (got ${decoded.length})`);
    }
    masterKeyBuf = decoded;
    return masterKeyBuf;
  } catch (err) {
    logger.error({ err: err.message }, 'Invalid MASTER_KEY — refusing to enable encryption');
    return null;
  }
}

function isEncryptionEnabled() {
  return Boolean(loadMasterKey());
}

function warnOnceIfDisabled() {
  if (warnedNoKey || isEncryptionEnabled()) return;
  warnedNoKey = true;
  const level = isProd ? 'error' : 'warn';
  logger[level](
    'MASTER_KEY not set — user API keys will be stored in PLAINTEXT in the database. ' +
      'Set MASTER_KEY in production to enable AES-256-GCM at-rest encryption.',
  );
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * Encrypt a secret string. If MASTER_KEY isn't configured, returns the input
 * unchanged (with a one-time warning).
 */
function encryptSecret(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;
  if (typeof plaintext !== 'string') return plaintext;
  if (isEncrypted(plaintext)) return plaintext; // already encrypted, don't double-wrap
  const key = loadMasterKey();
  if (!key) {
    warnOnceIfDisabled();
    return plaintext;
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, ciphertext]).toString('base64');
  return `${ENC_PREFIX}${payload}`;
}

/**
 * Decrypt a secret. Plaintext (non-prefixed) inputs are returned unchanged,
 * so this is safe to call on any value loaded from the DB.
 */
function decryptSecret(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  if (!isEncrypted(value)) return value;
  const key = loadMasterKey();
  if (!key) {
    logger.error('Encountered encrypted secret but MASTER_KEY is not set — cannot decrypt');
    return null;
  }
  try {
    const raw = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
    if (raw.length < IV_BYTES + TAG_BYTES + 1) {
      throw new Error('payload too short');
    }
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to decrypt secret — wrong MASTER_KEY?');
    return null;
  }
}

module.exports = {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  isEncryptionEnabled,
  warnOnceIfDisabled,
  ENC_PREFIX,
};
