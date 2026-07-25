'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Per-route rate limiters by cost class. Applied IN ADDITION to the global
 * 300-req/15min limiter at /api. These are per-IP, per-tier, sliding-window.
 *
 *   cheap   = read-mostly (lists, fetches)            — 120 req/min
 *   medium  = DB writes, small API calls (1-2 credits) —  30 req/min
 *   heavy   = scrapes, AI calls, bulk ops              —  10 req/min
 *
 * Each tier returns a fresh limiter instance per call so different routers
 * can have independent counters (the IP key is shared across all instances
 * of the same tier in a router, but separate from other routers' counters).
 */

const TIER_CONFIGS = {
  cheap: { windowMs: 60 * 1000, max: 120 },
  medium: { windowMs: 60 * 1000, max: 30 },
  heavy: { windowMs: 60 * 1000, max: 10 },
};

const baseOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
};

function tieredRateLimit(tier) {
  const config = TIER_CONFIGS[tier];
  if (!config) throw new Error(`Unknown rate-limit tier: ${tier}`);
  return rateLimit({
    ...baseOptions,
    windowMs: config.windowMs,
    max: config.max,
    message: {
      success: false,
      error: `Too many requests (${tier} tier). Try again in a minute.`,
    },
  });
}

// Convenience pre-built instances. Mounted with `router.use(heavy)` to apply
// to every route in a router, or as the first arg to a specific handler.
const heavy = tieredRateLimit('heavy');
const medium = tieredRateLimit('medium');
const cheap = tieredRateLimit('cheap');

module.exports = { tieredRateLimit, heavy, medium, cheap };
