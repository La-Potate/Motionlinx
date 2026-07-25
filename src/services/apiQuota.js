'use strict';

const logger = require('../utils/logger');
const { dbGet, dbRun } = require('../utils/dbAsync');

const DEFAULT_API_QUOTAS = {
  serper_reviews: { limitPerPeriod: 100, periodHours: 720 }, // 30 days
};

function computeQuotaBucketStart(periodHours) {
  if (!periodHours || Number.isNaN(periodHours)) return null;
  const now = Date.now();
  const bucketMs = periodHours * 60 * 60 * 1000;
  const bucketStart = Math.floor(now / bucketMs) * bucketMs;
  return new Date(bucketStart).toISOString();
}

async function getApiQuotaForUser(userId, service) {
  try {
    const row = await dbGet(
      `SELECT user_id, service,
              limit_per_period AS limitPerPeriod,
              period_hours AS periodHours
       FROM api_quota
       WHERE service = ? AND (user_id = ? OR user_id IS NULL)
       ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END
       LIMIT 1`,
      [service, userId, userId],
    );
    if (row) {
      return { limitPerPeriod: row.limitPerPeriod, periodHours: row.periodHours };
    }
    return DEFAULT_API_QUOTAS[service] || null;
  } catch (err) {
    logger.error({ err }, 'Failed to read API quota');
    return null;
  }
}

async function incrementApiUsage(userId, service, periodStart, increment) {
  await dbRun(
    `INSERT INTO api_usage (user_id, service, period_start, count)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, service, period_start)
     DO UPDATE SET count = count + excluded.count, updated_at = CURRENT_TIMESTAMP`,
    [userId, service, periodStart, increment],
  );
  const row = await dbGet(
    'SELECT count FROM api_usage WHERE user_id = ? AND service = ? AND period_start = ?',
    [userId, service, periodStart],
  );
  return row?.count || increment;
}

async function getApiUsageSnapshot(userId, service) {
  try {
    const quota = await getApiQuotaForUser(userId, service);
    if (!quota) return null;
    const periodStart = computeQuotaBucketStart(quota.periodHours);
    if (!periodStart) return null;
    const row = await dbGet(
      'SELECT count FROM api_usage WHERE user_id = ? AND service = ? AND period_start = ?',
      [userId, service, periodStart],
    );
    const used = row?.count || 0;
    return {
      service,
      limit: quota.limitPerPeriod,
      periodHours: quota.periodHours,
      periodStart,
      used,
      remaining: Math.max(0, quota.limitPerPeriod - used),
      resetsAt: new Date(
        new Date(periodStart).getTime() + quota.periodHours * 60 * 60 * 1000,
      ).toISOString(),
    };
  } catch (err) {
    logger.error({ err }, 'Failed to read API usage');
    return null;
  }
}

/**
 * Increment the usage counter and return whether the request fits inside the
 * configured quota. Returns `{ allowed: true }` (no quota configured) when no
 * quota row exists for this service.
 */
async function enforceApiQuota(userId, service, increment = 1) {
  const quota = await getApiQuotaForUser(userId, service);
  if (!quota) return { allowed: true };
  const periodStart = computeQuotaBucketStart(quota.periodHours);
  if (!periodStart) return { allowed: true };
  try {
    const used = await incrementApiUsage(userId, service, periodStart, increment);
    const resetsAt = new Date(
      new Date(periodStart).getTime() + quota.periodHours * 60 * 60 * 1000,
    ).toISOString();
    if (used > quota.limitPerPeriod) {
      return {
        allowed: false,
        limit: quota.limitPerPeriod,
        used,
        remaining: Math.max(0, quota.limitPerPeriod - used),
        resetsAt,
      };
    }
    return {
      allowed: true,
      limit: quota.limitPerPeriod,
      used,
      remaining: Math.max(0, quota.limitPerPeriod - used),
      resetsAt,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to increment API usage');
    return { allowed: false, error: 'Failed to track API usage' };
  }
}

module.exports = {
  DEFAULT_API_QUOTAS,
  computeQuotaBucketStart,
  getApiQuotaForUser,
  incrementApiUsage,
  getApiUsageSnapshot,
  enforceApiQuota,
};
