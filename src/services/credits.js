'use strict';

const logger = require('../utils/logger');
const { dbGet, dbRun } = require('../utils/dbAsync');
const { normalizeUserLevel } = require('../utils/userLevel');

const PLAN_CONFIG = {
  personal: { id: 'personal', label: 'Personal', monthlyCredits: 250, amount: 50 },
  business: { id: 'business', label: 'Business', monthlyCredits: 2000, amount: 250 },
  agency: { id: 'agency', label: 'Agency', monthlyCredits: 10000, amount: 650 },
};

const CREDIT_TOPUP = { credits: 1000, amount: 79 };
const OUT_OF_CREDITS_MESSAGE = 'You are out of credits. Please upgrade your plan to continue.';

function getPlanForRole(role = '') {
  return PLAN_CONFIG[normalizeUserLevel(role)] || null;
}

async function recordCreditTransaction(userId, change, reason = 'usage', meta = {}) {
  try {
    const user = await dbGet('SELECT credits FROM users WHERE id = ?', [userId]);
    const balanceAfter = user?.credits ?? null;
    await dbRun(
      'INSERT INTO credit_transactions (user_id, change, reason, balance_after, meta) VALUES (?, ?, ?, ?, ?)',
      [userId, change, reason, balanceAfter, JSON.stringify(meta || {})],
    );
  } catch (err) {
    logger.error({ err }, 'Failed to record credit transaction');
  }
}

/**
 * Atomically apply a credit delta. Throws a 402 error if it would push the
 * balance negative and allowNegative is false.
 */
async function applyCreditChange(userId, delta, reason = 'usage', meta = {}, allowNegative = false) {
  const user = await dbGet('SELECT credits FROM users WHERE id = ?', [userId]);
  if (!user) throw new Error('User not found for credit change');
  const currentCredits = typeof user.credits === 'number' ? user.credits : 0;
  const nextCredits = currentCredits + delta;
  if (!allowNegative && nextCredits < 0) {
    const error = new Error(OUT_OF_CREDITS_MESSAGE);
    error.status = 402;
    throw error;
  }
  await dbRun('UPDATE users SET credits = ? WHERE id = ?', [nextCredits, userId]);
  await recordCreditTransaction(userId, delta, reason, meta);
  return nextCredits;
}

async function setCreditsToPlanLimit(userId, planId, reason = 'subscription_payment', meta = {}) {
  const plan = getPlanForRole(planId);
  if (!plan) return null;
  const user = await dbGet('SELECT credits FROM users WHERE id = ?', [userId]);
  const currentCredits = typeof user?.credits === 'number' ? user.credits : 0;
  await dbRun(
    'UPDATE users SET credits = ?, credits_refreshed_at = CURRENT_TIMESTAMP WHERE id = ?',
    [plan.monthlyCredits, userId],
  );
  await recordCreditTransaction(
    userId,
    plan.monthlyCredits - currentCredits,
    reason,
    { ...meta, plan: planId },
  );
  return plan.monthlyCredits;
}

/**
 * Lazily refill the user's credits at the start of each calendar month.
 * Returns the (possibly mutated) user row.
 */
async function ensurePlanCredits(user) {
  if (!user) return user;
  const normalizedRole = normalizeUserLevel(user.role);
  const plan = getPlanForRole(normalizedRole);
  if (!plan) return user;
  const lastRefresh = user.credits_refreshed_at ? new Date(user.credits_refreshed_at) : null;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (!lastRefresh || lastRefresh < startOfMonth) {
    const nextCredits = plan.monthlyCredits;
    await dbRun(
      'UPDATE users SET credits = ?, credits_refreshed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [nextCredits, user.id],
    );
    await recordCreditTransaction(
      user.id,
      nextCredits - (typeof user.credits === 'number' ? user.credits : 0),
      'monthly_refill',
      { plan: plan.id },
    );
    return { ...user, credits: nextCredits, credits_refreshed_at: new Date().toISOString() };
  }
  return user;
}

module.exports = {
  PLAN_CONFIG,
  CREDIT_TOPUP,
  OUT_OF_CREDITS_MESSAGE,
  getPlanForRole,
  recordCreditTransaction,
  applyCreditChange,
  setCreditsToPlanLimit,
  ensurePlanCredits,
};
