'use strict';

const { USER_LEVELS, DEFAULT_USER_LEVEL } = require('../db/schema');

const USER_LEVEL_SET = new Set(USER_LEVELS);
const TRIAL_USER_LEVEL = 'trial';

function normalizeUserLevel(role) {
  return USER_LEVEL_SET.has(role) ? role : DEFAULT_USER_LEVEL;
}

const TRIAL_ALLOWED_METHODS = new Set([
  'GET /api/auth/validate',
  'POST /api/auth/validate',
]);
const TRIAL_ALLOWED_PREFIXES = ['/api/trial'];

function isTrialRequestAllowed(req = {}) {
  const method = (req.method || 'GET').toUpperCase();
  const rawPath = req.originalUrl || req.path || '';
  const path = rawPath.split('?')[0];
  const methodKey = `${method} ${path}`;
  if (TRIAL_ALLOWED_METHODS.has(methodKey)) return true;
  return TRIAL_ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

module.exports = {
  USER_LEVELS,
  DEFAULT_USER_LEVEL,
  TRIAL_USER_LEVEL,
  USER_LEVEL_SET,
  normalizeUserLevel,
  isTrialRequestAllowed,
};
