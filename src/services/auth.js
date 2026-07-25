'use strict';

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const {
  JWT_SECRET,
  MAX_FAILED_LOGINS,
  ACCOUNT_LOCK_MINUTES,
  REFRESH_TOKEN_TTL_DAYS,
} = require('../config/env');
const { dbGet, dbRun } = require('../utils/dbAsync');
const { normalizeUserLevel, TRIAL_USER_LEVEL } = require('../utils/userLevel');
const { getPlanForRole } = require('./credits');
const { ensureUserDir, writeUserSettingsToDisk } = require('../storage/userSettings');

function sanitizeUser(user = {}) {
  const normalizedRole = normalizeUserLevel(user.role);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: normalizedRole,
    auth_provider: user.auth_provider || 'local',
    avatar_url: user.avatar_url || null,
    email_verified: Boolean(user.email_verified),
    is_active: Boolean(user.is_active),
    credits: typeof user.credits === 'number' ? user.credits : null,
    credit_limit: getPlanForRole(normalizedRole)?.monthlyCredits || null,
    credits_refreshed_at: user.credits_refreshed_at || null,
    seat_count: user.seat_count || 1,
    subscription_status: user.subscription_status || null,
    subscription_current_period_end: user.subscription_current_period_end || null,
  };
}

function hashRefreshToken(token) {
  return crypto.createHash('sha512').update(token).digest('hex');
}

async function cleanupExpiredRefreshTokens(userId) {
  try {
    await dbRun(
      'DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at <= CURRENT_TIMESTAMP',
      [userId],
    );
  } catch (err) {
    logger.error({ err }, 'Failed to clean refresh tokens');
  }
}

async function createRefreshToken(userId) {
  const rawToken = `${
    crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
  }.${crypto.randomBytes(48).toString('hex')}`;
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const tokenHash = hashRefreshToken(rawToken);
  await dbRun(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, tokenHash, expiresAt],
  );
  return rawToken;
}

async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  const hashed = hashRefreshToken(rawToken);
  await dbRun('DELETE FROM refresh_tokens WHERE token_hash = ?', [hashed]);
}

async function findRefreshTokenRecord(rawToken) {
  if (!rawToken) return null;
  const hashed = hashRefreshToken(rawToken);
  return dbGet('SELECT * FROM refresh_tokens WHERE token_hash = ?', [hashed]);
}

async function issueTokensForUser(user) {
  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
  await cleanupExpiredRefreshTokens(user.id);
  const refreshToken = await createRefreshToken(user.id);
  return { token, refreshToken };
}

async function markSuccessfulLogin(userId) {
  await dbRun(
    'UPDATE users SET failed_logins = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [userId],
  );
}

async function registerFailedLogin(user) {
  const newCount = (user.failed_logins || 0) + 1;
  const lockEnabled = newCount >= MAX_FAILED_LOGINS;
  const params = [newCount];
  const updates = ['failed_logins = ?'];
  if (lockEnabled) {
    updates.push('locked_until = ?');
    params.push(new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000).toISOString());
  }
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(user.id);
  await dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  return lockEnabled;
}

function isAccountLocked(user) {
  if (!user || !user.locked_until) return false;
  return new Date(user.locked_until) > new Date();
}

async function ensureUniqueUsername(preferred) {
  const safeBase = (preferred || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/gi, '_')
    .replace(/_+/g, '_');
  let candidate = safeBase || `user_${Date.now()}`;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await dbGet('SELECT id FROM users WHERE username = ?', [candidate])) {
    candidate = `${safeBase}_${suffix++}`;
  }
  return candidate;
}

function randomPasswordHash() {
  return bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
}

async function upsertGoogleUser(profile = {}) {
  const googleId = profile.sub;
  const email = profile.email;
  const fullName = profile.name || '';
  const avatarUrl = profile.picture || null;
  const emailVerified = profile.email_verified ? 1 : 0;

  if (!googleId) throw new Error('Invalid Google profile');

  let user = await dbGet('SELECT * FROM users WHERE google_id = ?', [googleId]);

  if (!user && email) {
    user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (user) {
      await dbRun(
        "UPDATE users SET google_id = ?, auth_provider = 'google', email_verified = ?, avatar_url = COALESCE(?, avatar_url), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [googleId, emailVerified, avatarUrl, user.id],
      );
      user = {
        ...user,
        google_id: googleId,
        auth_provider: 'google',
        email_verified: emailVerified,
        avatar_url: avatarUrl || user.avatar_url,
      };
    }
  }

  if (!user) {
    const usernameSeed = fullName || (email ? email.split('@')[0] : `google_${googleId.slice(-6)}`);
    const username = await ensureUniqueUsername(usernameSeed);
    const placeholderEmail = email || `${username}@google.local`;
    const hash = randomPasswordHash();
    const insert = await dbRun(
      "INSERT INTO users (username, email, password_hash, role, auth_provider, google_id, email_verified, avatar_url, is_active) VALUES (?, ?, ?, ?, 'google', ?, ?, ?, 1)",
      [username, placeholderEmail, hash, TRIAL_USER_LEVEL, googleId, emailVerified, avatarUrl],
    );
    user = await dbGet('SELECT * FROM users WHERE id = ?', [insert.lastID]);
    ensureUserDir(insert.lastID);
    writeUserSettingsToDisk(insert.lastID, {
      profile: { username, email: placeholderEmail, role: TRIAL_USER_LEVEL },
    });
  }

  if (!user.is_active) {
    const err = new Error('Account disabled');
    err.status = 403;
    throw err;
  }

  return user;
}

module.exports = {
  sanitizeUser,
  hashRefreshToken,
  cleanupExpiredRefreshTokens,
  createRefreshToken,
  revokeRefreshToken,
  findRefreshTokenRecord,
  issueTokensForUser,
  markSuccessfulLogin,
  registerFailedLogin,
  isAccountLocked,
  ensureUniqueUsername,
  randomPasswordHash,
  upsertGoogleUser,
};
