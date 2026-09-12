'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { ACCOUNT_LOCK_MINUTES, GOOGLE_CLIENT_ID } = require('../config/env');
const { dbGet, dbRun, isUniqueViolation } = require('../utils/dbAsync');
const { TRIAL_USER_LEVEL } = require('../utils/userLevel');
const authenticate = require('../middleware/authenticate');
const { ensurePlanCredits } = require('../services/credits');
const { ensureUserDir, writeUserSettingsToDisk } = require('../storage/userSettings');
const { googleClient } = require('../integrations/google');
const {
  sanitizeUser,
  isAccountLocked,
  registerFailedLogin,
  markSuccessfulLogin,
  issueTokensForUser,
  findRefreshTokenRecord,
  revokeRefreshToken,
  upsertGoogleUser,
} = require('../services/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts, please try again later.',
});

const validateLogin = [
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

const validateSignup = [
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

// Token-validation endpoint for sibling services that share JWT_SECRET.
router.post('/validate', authenticate, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    email: req.user.email,
    role: req.user.role,
  });
});

router.post('/login', authLimiter, validateLogin, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password } = req.body;

  try {
    let user = await dbGet(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1',
      [username, username],
    );

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.auth_provider !== 'local') {
      return res.status(400).json({ error: 'Please sign in with Google' });
    }
    // `is_active` is already enforced by the query above, but bans live in a
    // separate table that nothing used to read — a banned user could log
    // straight back in and carry on.
    const ban = await dbGet('SELECT reason FROM user_bans WHERE user_id = ?', [user.id]);
    if (ban) {
      return res.status(403).json({ error: 'Account suspended' });
    }
    if (isAccountLocked(user)) {
      return res.status(423).json({
        error: `Account locked for ${ACCOUNT_LOCK_MINUTES} minutes due to too many failed attempts.`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const locked = await registerFailedLogin(user);
      return res.status(401).json({
        error: locked
          ? `Account locked for ${ACCOUNT_LOCK_MINUTES} minutes due to too many failed attempts.`
          : 'Invalid credentials',
      });
    }

    user = await ensurePlanCredits(user);
    await markSuccessfulLogin(user.id);
    const { token, refreshToken } = await issueTokensForUser(user);

    res.json({
      message: 'Login successful',
      token,
      refreshToken,
      user: sanitizeUser(user),
    });
  } catch (err) {
    logger.error({ err }, 'Authentication error');
    res.status(500).json({ error: 'Authentication error' });
  }
});

router.post('/signup', authLimiter, validateSignup, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      errors: errors.array(),
      error: errors.array()[0]?.msg || 'Invalid signup payload',
    });
  }

  const { username, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const result = await dbRun(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, TRIAL_USER_LEVEL],
    );
    ensureUserDir(result.lastID);
    writeUserSettingsToDisk(result.lastID, {
      profile: { username, email, role: TRIAL_USER_LEVEL },
      status: { invited: false, origin: 'self-signup' },
    });
    res.status(201).json({ message: 'Account created successfully', userId: result.lastID });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    logger.error({ err }, 'Signup error');
    res.status(500).json({ error: 'Failed to create account' });
  }
});

router.post('/google', authLimiter, async (req, res) => {
  if (!googleClient) {
    return res.status(503).json({ error: 'Google authentication is not configured' });
  }

  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ error: 'Google credential is required' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) return res.status(401).json({ error: 'Invalid Google token' });

    let user = await upsertGoogleUser(payload);
    user = await ensurePlanCredits(user);
    await markSuccessfulLogin(user.id);
    const { token, refreshToken } = await issueTokensForUser(user);

    res.json({
      message: 'Login successful',
      token,
      refreshToken,
      user: sanitizeUser(user),
    });
  } catch (err) {
    logger.error({ err }, 'Google auth error');
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Google authentication failed' });
  }
});

router.post('/refresh', authLimiter, async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

  try {
    const record = await findRefreshTokenRecord(refreshToken);
    if (!record) return res.status(401).json({ error: 'Invalid refresh token' });
    if (new Date(record.expires_at) <= new Date()) {
      await revokeRefreshToken(refreshToken);
      return res.status(401).json({ error: 'Refresh token expired' });
    }
    let user = await dbGet('SELECT * FROM users WHERE id = ? AND is_active = 1', [
      record.user_id,
    ]);
    if (!user) {
      await revokeRefreshToken(refreshToken);
      return res.status(401).json({ error: 'User no longer exists' });
    }
    // A banned user must not be able to mint a fresh access token here either.
    const refreshBan = await dbGet('SELECT 1 FROM user_bans WHERE user_id = ?', [user.id]);
    if (refreshBan) {
      await revokeRefreshToken(refreshToken);
      return res.status(403).json({ error: 'Account suspended' });
    }

    await revokeRefreshToken(refreshToken);
    user = await ensurePlanCredits(user);
    const { token, refreshToken: rotatedToken } = await issueTokensForUser(user);
    res.json({
      message: 'Session refreshed',
      token,
      refreshToken: rotatedToken,
      user: sanitizeUser(user),
    });
  } catch (err) {
    logger.error({ err }, 'Refresh token error');
    res.status(500).json({ error: 'Failed to refresh session' });
  }
});

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body || {};
  try {
    if (refreshToken) await revokeRefreshToken(refreshToken);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Logout error');
    res.status(500).json({ error: 'Failed to logout' });
  }
});

module.exports = router;
module.exports.authLimiter = authLimiter;
