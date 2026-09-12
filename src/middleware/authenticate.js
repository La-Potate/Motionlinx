'use strict';

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const logger = require('../utils/logger');
const { dbGet } = require('../utils/dbAsync');
const {
  TRIAL_USER_LEVEL,
  normalizeUserLevel,
  isTrialRequestAllowed,
} = require('../utils/userLevel');

function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, JWT_SECRET, (err, payload) => (err ? reject(err) : resolve(payload)));
  });
}

/**
 * Verify the JWT bearer token, then confirm the account behind it is still
 * allowed in. Populates `req.user` and enforces the trial-tier allowlist.
 *
 * The account-state lookup is not optional. A JWT stays valid for its full
 * hour, so without it a token issued before a ban, deactivation or deletion
 * kept working until it expired:
 *
 *   - banning a user did nothing at all — `user_bans` was written but never
 *     read, so a banned user could log straight back in;
 *   - `is_active = 0` was only enforced at login, so an existing token
 *     sailed past it;
 *   - a deleted user's token still reached every credit-exempt prefix,
 *     including /api/admin/users.
 *
 * Role comes from the database rather than the token, so a demotion takes
 * effect immediately instead of one token lifetime later.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  let payload;
  try {
    payload = await verifyToken(token);
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  let account;
  try {
    account = await dbGet(
      `SELECT u.id, u.username, u.email, u.role, u.is_active,
              EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = u.id) AS is_banned
         FROM users u WHERE u.id = ?`,
      [payload.id],
    );
  } catch (err) {
    logger.error({ err }, 'Account state lookup failed during authentication');
    return res.status(500).json({ error: 'Authentication error' });
  }

  if (!account) {
    return res.status(401).json({ error: 'Account no longer exists' });
  }
  if (account.is_banned) {
    return res.status(403).json({ error: 'Account suspended' });
  }
  if (!account.is_active) {
    return res.status(403).json({ error: 'Account is deactivated' });
  }

  req.user = {
    ...payload,
    id: account.id,
    username: account.username,
    email: account.email,
    role: normalizeUserLevel(account.role),
  };

  if (req.user.role === TRIAL_USER_LEVEL && !isTrialRequestAllowed(req)) {
    return res
      .status(403)
      .json({ error: 'Trial accounts do not have access to this feature yet.' });
  }
  return next();
}

module.exports = authenticate;
module.exports.authenticate = authenticate;
