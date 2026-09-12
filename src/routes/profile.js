'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');
const { dbGet, dbRun, dbAll, isUniqueViolation } = require('../utils/dbAsync');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// Mirrors the signup rules in routes/auth.js so an account cannot be edited
// into a state it could never have been created in.
const USERNAME_MIN = 3;
const USERNAME_MAX = 64;
const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.put('/', authenticate, async (req, res) => {
  const userId = req.user.id;
  const body = req.body || {};

  // Only apply the fields actually supplied, so changing just the email does
  // not blank the username. Previously both were written unconditionally:
  // a partial update bound `undefined` and failed with a bare 500, while an
  // empty string was accepted and could erase the account's login identity.
  const updates = [];
  const params = [];

  if (body.username !== undefined) {
    if (typeof body.username !== 'string') {
      return res.status(400).json({ error: 'Username must be a string' });
    }
    const username = body.username.trim();
    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
      return res
        .status(400)
        .json({ error: `Username must be between ${USERNAME_MIN} and ${USERNAME_MAX} characters` });
    }
    updates.push('username = ?');
    params.push(username);
  }

  if (body.email !== undefined) {
    if (typeof body.email !== 'string') {
      return res.status(400).json({ error: 'Email must be a string' });
    }
    const email = body.email.trim();
    if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    updates.push('email = ?');
    params.push(email);
  }

  if (!updates.length) {
    return res.status(400).json({ error: 'Nothing to update — supply username and/or email' });
  }

  try {
    params.push(userId);
    await dbRun(
      `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params,
    );
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    logger.error({ err }, 'Error updating profile');
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.get('/credit-history', authenticate, async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

  try {
    const rows = await dbAll(
      `SELECT id, change, reason, balance_after as balanceAfter, meta, created_at as createdAt
       FROM credit_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit],
    );

    const parsed = rows.map((row) => ({
      ...row,
      meta: row.meta ? JSON.parse(row.meta) : {},
    }));
    res.json({ transactions: parsed });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch credit history');
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;

// Stand-alone password change is mounted at /api/change-password by src/app.js
// (kept as a separate export so the composer can mount it there without
// renaming the existing client route).
const passwordRouter = express.Router();

passwordRouter.post('/', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { oldPassword, newPassword } = req.body || {};

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Old password and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  try {
    const user = await dbGet('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await dbRun(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, userId],
    );
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    logger.error({ err }, 'Failed to change password');
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports.passwordRouter = passwordRouter;
