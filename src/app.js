'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');

const envConfig = require('./config/env');
const { GOOGLE_CLIENT_ID, isProd } = envConfig;
const logger = require('./utils/logger');

const { USERDATA_ROOT } = require('./storage/paths');
const { ensureUserDir } = require('./storage/userSettings');

const {
  buildHelmet,
  attachCspNonce,
  permissionsPolicy,
  buildCspReportOnly,
} = require('./config/helmet');
const { buildCorsMiddleware } = require('./config/cors');

const authenticateToken = require('./middleware/authenticate');
const creditGuard = require('./middleware/creditGuard');
const { CREDIT_EXEMPT_PREFIXES } = require('./middleware/creditGuard');

// Bring up the SQLite handle (also runs WAL/synchronous pragmas).
const db = require('./db/connection');
const { syncApiKeysFromDatabase } = require('./services/apiKeySync');

function migrateLegacyDatabase() {
  const legacyDbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
  const targets = [
    [legacyDbPath, path.join(USERDATA_ROOT, 'database.sqlite')],
    [`${legacyDbPath}-wal`, `${path.join(USERDATA_ROOT, 'database.sqlite')}-wal`],
    [`${legacyDbPath}-shm`, `${path.join(USERDATA_ROOT, 'database.sqlite')}-shm`],
  ];
  let migrated = false;
  for (const [source, target] of targets) {
    if (fs.existsSync(source) && !fs.existsSync(target)) {
      fs.copyFileSync(source, target);
      migrated = true;
    }
  }
  if (migrated) {
    logger.info('Legacy data directory detected. Migrated existing database files into USERDATA.');
  }
}

async function buildApp() {
  migrateLegacyDatabase();

  // Run schema migrations BEFORE we wire routes — otherwise the first
  // request on a fresh DB could hit a route that depends on a table the
  // migration hasn't created yet.
  await require('./db/schema').initSchema();

  const app = express();

  if (!GOOGLE_CLIENT_ID) {
    logger.warn('Google authentication is disabled. Set GOOGLE_CLIENT_ID to enable it.');
  }

  app.use(attachCspNonce);
  app.use(buildHelmet());
  app.use(buildCspReportOnly()); // dev-only no-op in prod
  app.use(permissionsPolicy);
  app.use(buildCorsMiddleware());

  // One-line-per-request access log (status, latency, route). Skips
  // /api/health to keep load-balancer probes out of the log stream.
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/api/health' || req.url === '/api/health/ready',
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  logger.info(
    `JWT_SECRET: ${process.env.JWT_SECRET ? 'Custom (SECURE)' : 'Default (INSECURE - Development only)'}`,
  );

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
  });
  app.use('/api', limiter);
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        // Stripe webhooks need the raw body for signature verification.
        if (req.originalUrl === '/api/billing/webhook') {
          req.rawBody = buf.toString();
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));

  // Ensure per-user directories exist for every user already in the DB.
  // (Schema migrations ran above; the `users` table is guaranteed to exist.)
  db.all('SELECT id FROM users', (err, rows = []) => {
    if (err) {
      logger.error({ err }, 'Failed to synchronise user directories');
      return;
    }
    rows.forEach((row) => ensureUserDir(row.id));
  });

  // Restore service API keys from DB ~2s after boot.
  setTimeout(syncApiKeysFromDatabase, 2000);

  // Liveness probe — process is up. Always returns 200 if Express can respond.
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: envConfig.NODE_ENV,
      corsEnabled: true,
    });
  });

  // Readiness probe — process is up AND dependencies are healthy. Returns 503
  // if SQLite can't be queried or USERDATA_ROOT isn't writable. Use this for
  // load balancer / orchestrator readiness checks.
  app.get('/api/health/ready', async (_req, res) => {
    const checks = { db: 'pending', userdata: 'pending' };
    let httpStatus = 200;

    // 1. Can we query SQLite?
    try {
      await new Promise((resolve, reject) => {
        db.get('SELECT 1 AS ok', (err) => (err ? reject(err) : resolve()));
      });
      checks.db = 'ok';
    } catch (err) {
      checks.db = `error: ${err.message}`;
      httpStatus = 503;
    }

    // 2. Is USERDATA_ROOT writable?
    try {
      const probe = path.join(USERDATA_ROOT, `.ready-probe-${process.pid}`);
      await fsp.writeFile(probe, 'ok');
      await fsp.unlink(probe);
      checks.userdata = 'ok';
    } catch (err) {
      checks.userdata = `error: ${err.message}`;
      httpStatus = 503;
    }

    res.status(httpStatus).json({
      status: httpStatus === 200 ? 'ready' : 'not-ready',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  // Global JWT + credit guard for /api/* routes, with allowlist for auth/public
  // endpoints (see CREDIT_EXEMPT_PREFIXES).
  app.use('/api', (req, res, next) => {
    const reqPath = req.originalUrl || req.path || '';
    if (CREDIT_EXEMPT_PREFIXES.some((prefix) => reqPath.startsWith(prefix))) {
      return next();
    }
    return authenticateToken(req, res, () => creditGuard()(req, res, next));
  });

  // Auth + identity.
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/billing', require('./routes/billing'));

  const profileRouter = require('./routes/profile');
  app.use('/api/profile', profileRouter);
  app.use('/api/change-password', profileRouter.passwordRouter);

  // Admin / content.
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/content', require('./routes/content'));

  // Projects / groups / tasks / whiteboard (multi-mounted at /api).
  app.use('/api', require('./routes/projects'));

  // Citations (entities/listings/profile-health/publishers + audit).
  app.use('/api/citations', require('./routes/citations'));
  app.use('/api/citation-audit', require('./routes/citation-audit'));

  // Heatmap (one-shot grid at /api/serp/heatmap + persisted reports at
  // /api/heatmap/reports) and rank tracker (multi-mounted at /api).
  app.use('/api', require('./routes/heatmap'));
  app.use('/api', require('./routes/rankings'));

  // Settings + collaboration.
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/page-commenter', require('./routes/page-commenter'));
  app.use('/api/site-marker', require('./routes/site-marker'));

  // SEO toolkit feature routes.
  app.use('/api/local', require('./routes/local'));
  app.use('/api/schema', require('./routes/schema'));
  app.use('/api/web-search', require('./routes/web-search'));
  app.use('/api/ai-seo', require('./routes/ai-seo'));
  app.use('/api/serp', require('./routes/serp'));
  app.use('/api/geocode', require('./routes/geocode'));

  // AI Traffic Report — connects user's Google Analytics via OAuth and
  // reports AI engine traffic. Exempt from credit guard (see creditGuard.js);
  // routes/ga4.js re-applies JWT auth on every endpoint except the OAuth
  // callback, which is reached via browser redirect with no auth header.
  app.use('/api/ga4', require('./routes/ga4'));

  // AI Assistant — connects user's Google Search Console (same OAuth client
  // as GA4, different scope) and runs full SEO analysis via DataForSEO. Same
  // exempt-from-credit-guard pattern as GA4. The analysis job is registered
  // by requiring the job handler module — keep it AFTER the route is mounted
  // so app.js never holds a stale handler reference.
  app.use('/api/gsc', require('./routes/gsc'));
  app.use('/api/ai-assistant', require('./routes/ai-assistant'));
  require('./jobs/aiAssistantAnalysis');

  // Serve the CRA/Vite build + SPA catch-all.
  app.use(express.static(path.join(__dirname, '..', 'client', 'build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'build', 'index.html'));
  });

  // Last-resort error handler.
  app.use((err, _req, res, _next) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'Something went wrong!' });
  });

  return app;
}

function attachShutdownHandlers() {
  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`);
    db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Last-resort safety net for async errors that escape every try/catch.
 *
 * Express catches throws inside handlers, but an error raised on a detached
 * async path — a node-sqlite3 'error' event with no listener, a floating
 * promise — bypasses it entirely and, by default, terminates the process. For
 * a single-process self-hosted app that means one stray error takes the whole
 * instance offline for every user.
 *
 * We therefore log and keep serving. The trade-off is deliberate and worth
 * stating: Node's own guidance is that a process may hold inconsistent state
 * after an uncaught exception, so this is a net, NOT a licence to leave the
 * underlying bug in place. Anything logged here is a defect to fix at source —
 * these lines are logged at `fatal`/`error` precisely so they stay loud.
 */
function attachProcessGuards() {
  process.on('unhandledRejection', (reason) => {
    logger.error(
      { err: reason instanceof Error ? reason : new Error(String(reason)) },
      'Unhandled promise rejection — server kept running; fix the source',
    );
  });

  process.on('uncaughtException', (err) => {
    logger.fatal(
      { err },
      'Uncaught exception — server kept running, but process state may be unreliable; fix the source',
    );
  });
}

async function start() {
  // Install the guards before anything can throw asynchronously.
  attachProcessGuards();
  const app = await buildApp();
  const server = app.listen(envConfig.PORT, () => {
    logger.info(`Server running on port ${envConfig.PORT}`);
    logger.info(`Environment: ${envConfig.NODE_ENV || 'development'}`);
  });

  // Binding failures MUST stay fatal. The process guards above deliberately
  // keep the process alive through runtime errors, but that must not extend
  // to startup: a process that failed to bind (EADDRINUSE, EACCES) is not
  // serving anything, and lingering would leave a zombie that a supervisor
  // — Docker's restart policy, nodemon, systemd — never restarts. Exiting
  // non-zero is the useful behaviour here.
  server.on('error', (err) => {
    logger.fatal({ err }, `Could not bind port ${envConfig.PORT} — exiting`);
    process.exit(1);
  });

  attachShutdownHandlers();
  return app;
}

module.exports = { buildApp, start };
