'use strict';

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const {
  TRIAL_USER_LEVEL,
  normalizeUserLevel,
  isTrialRequestAllowed,
} = require('../utils/userLevel');

/**
 * Verify the JWT bearer token on the request. Populates `req.user` and
 * enforces trial-tier route allowlist.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = {
      ...payload,
      id: payload.id,
      role: normalizeUserLevel(payload.role),
    };
    if (req.user.role === TRIAL_USER_LEVEL && !isTrialRequestAllowed(req)) {
      return res.status(403).json({ error: 'Trial accounts do not have access to this feature yet.' });
    }
    next();
  });
}

module.exports = authenticate;
module.exports.authenticate = authenticate;
