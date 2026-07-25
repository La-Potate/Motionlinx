'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const { dbGet, dbAll, dbRun } = require('../utils/dbAsync');
const { USER_LEVEL_SET, DEFAULT_USER_LEVEL } = require('../utils/userLevel');
const { getPlanForRole } = require('../services/credits');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const {
  ensureUserDir,
  writeUserSettingsToDisk,
  archiveUserDir,
} = require('../storage/userSettings');

const router = express.Router();

// All admin endpoints require auth + admin role.
router.use(authenticate, requireAdmin);

const validateAdminSignup = [
  body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

// Users CRUD
router.get('/users', async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT u.id, u.username, u.email, u.role, u.is_active, u.created_at, u.credits,
              CASE WHEN ub.id IS NOT NULL THEN 1 ELSE 0 END as is_banned
       FROM users u
       LEFT JOIN user_bans ub ON u.id = ub.user_id
       ORDER BY u.created_at DESC`,
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'Error fetching users');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const row = await dbGet(
      `SELECT u.id, u.username, u.email, u.role, u.is_active, u.created_at, u.credits,
              CASE WHEN ub.id IS NOT NULL THEN 1 ELSE 0 END as is_banned
       FROM users u
       LEFT JOIN user_bans ub ON u.id = ub.user_id
       WHERE u.id = ?`,
      [req.params.id],
    );
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json(row);
  } catch (err) {
    logger.error({ err }, 'Error fetching user');
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/users', validateAdminSignup, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array();
    return res.status(400).json({
      error: details[0]?.msg || 'Invalid admin payload',
      errors: details,
    });
  }
  const { username, email, password, role = DEFAULT_USER_LEVEL } = req.body;
  const normalizedRole = (role || DEFAULT_USER_LEVEL).toString().toLowerCase();
  if (!USER_LEVEL_SET.has(normalizedRole)) {
    return res.status(400).json({ error: 'Invalid user level selection' });
  }
  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    const result = await dbRun(
      'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, normalizedRole],
    );
    ensureUserDir(result.lastID);
    writeUserSettingsToDisk(result.lastID, {
      profile: { username, email, role: normalizedRole },
      meta: { createdBy: req.user.id },
    });
    const plan = getPlanForRole(normalizedRole);
    if (plan) {
      await dbRun(
        'UPDATE users SET credits = ?, credits_refreshed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [plan.monthlyCredits, result.lastID],
      );
    }
    res.json({ message: 'User created successfully', userId: result.lastID });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    logger.error({ err }, 'Error creating user');
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/users/:id', async (req, res) => {
  const userId = req.params.id;
  const { username, email, role, is_active, credits, credit_limit } = req.body;

  try {
    const existing = await dbGet(
      'SELECT username, email, role, is_active, credits, credit_limit FROM users WHERE id = ?',
      [userId],
    );
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (Number(userId) === Number(req.user.id) && existing.role === 'admin' && role && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot change your own admin role' });
    }
    let normalizedRole = existing.role;
    if (role !== undefined && role !== null) {
      const candidate = role.toString().trim().toLowerCase();
      if (!candidate || !USER_LEVEL_SET.has(candidate)) {
        return res.status(400).json({ error: 'Invalid user level selection' });
      }
      normalizedRole = candidate;
    }
    const next = {
      username: username !== undefined ? username : existing.username,
      email: email !== undefined ? email : existing.email,
      is_active: is_active !== undefined ? is_active : existing.is_active,
      credits: credits !== undefined ? credits : existing.credits,
      credit_limit: credit_limit !== undefined ? credit_limit : existing.credit_limit,
    };

    const result = await dbRun(
      'UPDATE users SET username = ?, email = ?, role = ?, is_active = ?, credits = ?, credit_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [next.username, next.email, normalizedRole, next.is_active, next.credits, next.credit_limit, userId],
    );
    if (!result.changes) return res.status(404).json({ error: 'User not found' });

    if (credits === undefined && role !== undefined) {
      const plan = getPlanForRole(normalizedRole);
      if (plan) {
        await dbRun(
          'UPDATE users SET credits = COALESCE(credits, ?), credits_refreshed_at = COALESCE(credits_refreshed_at, CURRENT_TIMESTAMP) WHERE id = ?',
          [plan.monthlyCredits, userId],
        );
      }
    }

    writeUserSettingsToDisk(userId, {
      profile: { username, email, role: normalizedRole },
      status: { is_active },
    });
    res.json({ message: 'User updated successfully' });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    logger.error({ err }, 'Error updating user');
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.post('/users/:id/credits', async (req, res) => {
  const userId = req.params.id;
  const parsedAmount = parseInt(req.body?.amount, 10);
  if (Number.isNaN(parsedAmount)) {
    return res.status(400).json({ error: 'Amount must be a valid integer' });
  }
  try {
    const result = await dbRun(
      'UPDATE users SET credits = COALESCE(credits, 0) + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [parsedAmount, userId],
    );
    if (!result.changes) return res.status(404).json({ error: 'User not found' });
    const updated = await dbGet('SELECT credits FROM users WHERE id = ?', [userId]);
    res.json({ message: 'Credits updated', credits: updated?.credits ?? null });
  } catch (err) {
    logger.error({ err }, 'Failed to update credits');
    res.status(500).json({ error: 'Unable to update credits' });
  }
});

router.delete('/users/:id', async (req, res) => {
  const userId = req.params.id;
  try {
    const result = await dbRun('DELETE FROM users WHERE id = ?', [userId]);
    if (!result.changes) return res.status(404).json({ error: 'User not found' });
    archiveUserDir(userId);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    logger.error({ err }, 'Error deleting user');
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Bans
router.post('/users/:id/ban', async (req, res) => {
  const userId = req.params.id;
  const { reason } = req.body;
  const bannedBy = req.user.id;
  if (!reason) return res.status(400).json({ error: 'Ban reason is required' });

  try {
    await dbRun(
      'INSERT INTO user_bans (user_id, reason, banned_by) VALUES (?, ?, ?)',
      [userId, reason, bannedBy],
    );
    writeUserSettingsToDisk(userId, {
      status: { banned: true, banReason: reason, bannedAt: new Date().toISOString(), bannedBy },
    });
    res.json({ message: 'User banned successfully' });
  } catch (err) {
    logger.error({ err }, 'Error banning user');
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

router.post('/users/:id/unban', async (req, res) => {
  const userId = req.params.id;
  try {
    await dbRun('DELETE FROM user_bans WHERE user_id = ?', [userId]);
    writeUserSettingsToDisk(userId, {
      status: { banned: false, unbannedAt: new Date().toISOString(), unbannedBy: req.user.id },
    });
    res.json({ message: 'User unbanned successfully' });
  } catch (err) {
    logger.error({ err }, 'Error unbanning user');
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

router.post('/ban-ip', async (req, res) => {
  const { ipAddress, reason } = req.body;
  const bannedBy = req.user.id;
  if (!ipAddress || !reason) {
    return res.status(400).json({ error: 'IP address and reason are required' });
  }
  try {
    await dbRun(
      'INSERT INTO banned_ips (ip_address, reason, banned_by) VALUES (?, ?, ?)',
      [ipAddress, reason, bannedBy],
    );
    res.json({ message: 'IP address banned successfully' });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(400).json({ error: 'IP address is already banned' });
    }
    logger.error({ err }, 'Error banning IP');
    res.status(500).json({ error: 'Failed to ban IP address' });
  }
});

router.get('/banned-ips', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT bi.*, u.username as banned_by_username
      FROM banned_ips bi
      JOIN users u ON bi.banned_by = u.id
      ORDER BY bi.banned_at DESC
    `);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, 'Error fetching banned IPs');
    res.status(500).json({ error: 'Failed to fetch banned IPs' });
  }
});

router.delete('/banned-ips/:ipAddress', async (req, res) => {
  try {
    const result = await dbRun('DELETE FROM banned_ips WHERE ip_address = ?', [req.params.ipAddress]);
    if (!result.changes) return res.status(404).json({ error: 'IP address not found' });
    res.json({ message: 'IP address unbanned successfully' });
  } catch (err) {
    logger.error({ err }, 'Error unbanning IP');
    res.status(500).json({ error: 'Failed to unban IP address' });
  }
});

// Stats
router.get('/stats', async (req, res) => {
  try {
    const [u1, u2, u3, u4] = await Promise.all([
      dbGet('SELECT COUNT(*) as count FROM users'),
      dbGet('SELECT COUNT(*) as count FROM users WHERE is_active = 1'),
      dbGet('SELECT COUNT(*) as count FROM user_bans'),
      dbGet('SELECT COUNT(*) as count FROM banned_ips'),
    ]);
    res.json({
      totalUsers: u1.count,
      activeUsers: u2.count,
      bannedUsers: u3.count,
      bannedIPs: u4.count,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get stats');
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// API request logs
router.get('/api-logs', async (req, res) => {
  const { service = '', limit = 200, userId } = req.query;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const filters = [];
  const params = [];
  if (service) {
    filters.push('service = ?');
    params.push(service);
  }
  if (userId) {
    filters.push('user_id = ?');
    params.push(userId);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(safeLimit);

  try {
    const rows = await dbAll(
      `SELECT id, user_id as userId, service, credits, meta, success,
              status_code as statusCode, error_message as errorMessage,
              created_at as createdAt
       FROM api_request_logs ${whereClause}
       ORDER BY created_at DESC LIMIT ?`,
      params,
    );
    res.json({
      logs: rows.map((row) => ({
        ...row,
        meta: row.meta ? JSON.parse(row.meta) : {},
        success: Boolean(row.success),
      })),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch API logs');
    res.status(500).json({ error: 'Failed to fetch API logs' });
  }
});

// Credit usage
router.get('/credit-usage', async (req, res) => {
  const { limit = 100, offset = 0, userId } = req.query;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const filters = [];
  const params = [];
  if (userId) {
    filters.push('ct.user_id = ?');
    params.push(userId);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(safeLimit, safeOffset);

  try {
    const rows = await dbAll(
      `SELECT ct.id, ct.user_id as userId, u.username, u.email,
              ct.change, ct.reason, ct.balance_after as balanceAfter,
              ct.meta, ct.created_at as createdAt
       FROM credit_transactions ct
       JOIN users u ON ct.user_id = u.id
       ${whereClause}
       ORDER BY ct.created_at DESC LIMIT ? OFFSET ?`,
      params,
    );
    res.json({
      transactions: rows.map((row) => ({
        ...row,
        meta: row.meta ? JSON.parse(row.meta) : {},
      })),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch credit usage');
    res.status(500).json({ error: 'Failed to fetch credit usage' });
  }
});

router.get('/credit-usage/export', async (req, res) => {
  const { userId, startDate, endDate } = req.query;
  const filters = [];
  const params = [];
  if (userId) {
    filters.push('ct.user_id = ?');
    params.push(userId);
  }
  if (startDate) {
    filters.push('ct.created_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    filters.push('ct.created_at <= ?');
    params.push(endDate);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const rows = await dbAll(
      `SELECT ct.user_id as userId, u.username, u.email,
              ct.change, ct.reason, ct.balance_after as balanceAfter,
              ct.created_at as createdAt, ct.meta
       FROM credit_transactions ct
       JOIN users u ON ct.user_id = u.id
       ${whereClause}
       ORDER BY ct.created_at DESC`,
      params,
    );

    const lines = ['User ID,Username,Email,Credits Change,Reason,Balance After,Date,Service'];
    rows.forEach((row) => {
      const meta = row.meta ? JSON.parse(row.meta) : {};
      lines.push(
        [
          row.userId,
          `"${(row.username || '').replace(/"/g, '""')}"`,
          `"${(row.email || '').replace(/"/g, '""')}"`,
          row.change,
          `"${(row.reason || '').replace(/"/g, '""')}"`,
          row.balanceAfter || 0,
          `"${row.createdAt}"`,
          `"${(meta.service || '').replace(/"/g, '""')}"`,
        ].join(','),
      );
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="credit-usage-${Date.now()}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    logger.error({ err }, 'Failed to export credit usage');
    res.status(500).json({ error: 'Failed to export' });
  }
});

module.exports = router;
