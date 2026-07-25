'use strict';

const genericPool = require('generic-pool');
const logger = require('../../utils/logger');

const PLAYWRIGHT_RENDER_TIMEOUT_MS = 30000;
const PLAYWRIGHT_NAV_TIMEOUT_MS = 20000;
const POOL_MAX = parseInt(process.env.PLAYWRIGHT_POOL_MAX || '3', 10);
const POOL_MIN = 0;
const POOL_IDLE_TIMEOUT_MS = 60000;

const browserTypeCache = new Map();

async function ensureBrowserType(name = 'chromium') {
  if (browserTypeCache.has(name)) return browserTypeCache.get(name);
  let resolved = null;
  try {
    // eslint-disable-next-line global-require
    const mod = require('playwright');
    if (mod && mod[name]) resolved = mod[name];
  } catch (_) {
    // ignore, try playwright-core
  }
  if (!resolved) {
    try {
      // eslint-disable-next-line global-require
      const mod = require('playwright-core');
      if (mod && mod[name]) resolved = mod[name];
    } catch (_) {
      // ignore
    }
  }
  if (!resolved) {
    logger.warn({ name }, 'Playwright browser type not installed; pool will be unavailable');
  }
  browserTypeCache.set(name, resolved);
  return resolved;
}

// Per-browser-type pool of long-lived browser instances. Callers acquire a
// browser, create a fresh context for isolation, use it, then close the
// context. The browser itself is returned to the pool.
const _pools = new Map();

function getBrowserPool(browserName = 'chromium') {
  if (_pools.has(browserName)) return _pools.get(browserName);

  const factory = {
    async create() {
      const browserType = await ensureBrowserType(browserName);
      if (!browserType) throw new Error(`Playwright ${browserName} not installed`);
      const browser = await browserType.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      logger.debug({ browserName }, 'Playwright browser launched into pool');
      return browser;
    },
    async destroy(browser) {
      try {
        await browser.close();
      } catch (err) {
        logger.warn({ err }, 'Failed to close Playwright browser');
      }
    },
    async validate(browser) {
      return browser && browser.isConnected();
    },
  };

  const pool = genericPool.createPool(factory, {
    max: POOL_MAX,
    min: POOL_MIN,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    testOnBorrow: true,
    acquireTimeoutMillis: PLAYWRIGHT_RENDER_TIMEOUT_MS,
  });

  _pools.set(browserName, pool);
  return pool;
}

/**
 * High-level helper: borrow a browser, create a fresh context, run `fn(context)`,
 * cleanly tear down. Returns whatever `fn` returns.
 */
async function withBrowserContext(fn, { browserName = 'chromium', contextOptions = {} } = {}) {
  const pool = getBrowserPool(browserName);
  const browser = await pool.acquire();
  let context = null;
  try {
    context = await browser.newContext({
      ignoreHTTPSErrors: true,
      ...contextOptions,
    });
    return await fn(context);
  } finally {
    if (context) {
      try {
        await context.close();
      } catch (err) {
        logger.warn({ err }, 'Failed to close Playwright context');
      }
    }
    try {
      await pool.release(browser);
    } catch (err) {
      logger.warn({ err }, 'Failed to release Playwright browser to pool');
    }
  }
}

async function drainAllPools() {
  for (const [name, pool] of _pools.entries()) {
    try {
      await pool.drain();
      await pool.clear();
      logger.info({ browserName: name }, 'Playwright pool drained');
    } catch (err) {
      logger.warn({ err, browserName: name }, 'Failed to drain Playwright pool');
    }
  }
  _pools.clear();
}

module.exports = {
  PLAYWRIGHT_RENDER_TIMEOUT_MS,
  PLAYWRIGHT_NAV_TIMEOUT_MS,
  ensureBrowserType,
  getBrowserPool,
  withBrowserContext,
  drainAllPools,
};
