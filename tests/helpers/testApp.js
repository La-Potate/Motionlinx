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

module.exports = { buildTestApp, cleanupTestApp };
