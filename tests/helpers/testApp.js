'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Build an isolated Express app instance for a single test file.
 *
 * Each call points USERDATA_PATH at a fresh temp directory so SQLite + JSON
 * stores don't bleed between tests. Returns the Express app (not yet listening)
 * so `supertest(app)` can drive it without binding a port.
 */
async function buildTestApp() {
  // Isolate every test's data into its own temp dir.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-toolkit-test-'));
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  // Supertest drives the app in-memory; PORT is not actually bound. Any
  // positive number satisfies the env schema's .positive() validator.
  process.env.PORT = process.env.PORT || '4001';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';
  process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3001';
  process.env.USERDATA_PATH = tmpRoot;
  // Exercise the encrypted-at-rest path, which is what production runs.
  process.env.MASTER_KEY =
    process.env.MASTER_KEY || require('crypto').randomBytes(32).toString('base64');

  // Bust the require cache so each test gets a fresh app + fresh DB connection.
  // app.js + paths.js + db/connection.js cache module-level state on require.
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}src${path.sep}`)) {
      delete require.cache[key];
    }
  }

  // eslint-disable-next-line global-require
  const { buildApp } = require('../../src/app');
  const app = await buildApp();
  return { app, tmpRoot };
}

function cleanupTestApp({ tmpRoot } = {}) {
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Insert a user straight into the database and mint a matching JWT.
 *
 * Going through /api/auth/signup would work but the auth limiter allows only
 * 10 attempts per window, which a suite that needs several accounts exhausts.
 *
 * `credits_refreshed_at` is set deliberately: leaving it NULL makes the lazy
 * monthly refill fire on the account's first billable request and silently
 * reset the balance to the plan limit, which masks credit assertions.
 */
async function seedUser({ username, role = 'business', credits = 1000 } = {}) {
  // eslint-disable-next-line global-require
  const jwt = require('jsonwebtoken');
  // eslint-disable-next-line global-require
  const { dbRun } = require('../../src/utils/dbAsync');
  // eslint-disable-next-line global-require
  const { ensureUserDir } = require('../../src/storage/userSettings');

  const email = `${username}@test.local`;
  const result = await dbRun(
    `INSERT INTO users (username, email, password_hash, role, credits, credits_refreshed_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [username, email, '$2b$04$notarealhashonlyfortests', role, credits],
  );
  const id = result.lastID;
  ensureUserDir(id);
  const token = jwt.sign({ id, username, email, role }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
  return { id, username, email, role, token, auth: { Authorization: `Bearer ${token}` } };
}

module.exports = { buildTestApp, cleanupTestApp, seedUser };
