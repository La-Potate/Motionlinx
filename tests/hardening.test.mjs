import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// The timeout test needs to reach a local listener, which the SSRF guard
// otherwise refuses. This file runs in its own fork, so the flag is scoped.
process.env.ALLOW_PRIVATE_URL_FETCH = '1';

const { buildTestApp, cleanupTestApp, seedUser } = require('./helpers/testApp');
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('production hardening', () => {
  let ctx;
  let dbGet;
  let dbRun;

  beforeAll(async () => {
    ctx = await buildTestApp();
    ({ dbGet, dbRun } = require('../src/utils/dbAsync'));
  });
  afterAll(() => cleanupTestApp(ctx));

  describe('upstream fetch is bounded (A-05)', () => {
    let blackhole;
    beforeAll(async () => {
      // Accepts the connection and never answers.
      blackhole = http.createServer(() => {});
      await new Promise((resolve) => blackhole.listen(0, '127.0.0.1', resolve));
    });
    afterAll(() => blackhole?.close());

    it('rejects within the requested timeout instead of hanging', async () => {
      const { ensureFetch } = require('../src/utils/smartFetch');
      const fetcher = await ensureFetch();
      const started = Date.now();
      await expect(
        fetcher(`http://127.0.0.1:${blackhole.address().port}/`, { timeout: 400 }),
      ).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(3000);
    });

    it('honours a caller-supplied signal as well', async () => {
      const { ensureFetch } = require('../src/utils/smartFetch');
      const fetcher = await ensureFetch();
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 200);
      const started = Date.now();
      await expect(
        fetcher(`http://127.0.0.1:${blackhole.address().port}/`, {
          signal: controller.signal,
          timeout: 30000,
        }),
      ).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(3000);
    });
  });

  describe('marker and comment payloads are capped (A-09)', () => {
    it('refuses more than 500 markers and clamps oversize text', async () => {
      const sm = require('../src/storage/siteMarker');
      const user = await seedUser({ username: 'marker-cap', credits: 1000 });
      const pageId = sm.generateSiteMarkerId();
      await sm.writeSiteMarkerHtml(user.id, pageId, '<html></html>');
      await sm.writeSiteMarkerMeta(user.id, pageId, {
        id: pageId, url: 'https://x.example/', title: 't', markers: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      const tooMany = Array.from({ length: 501 }, (_, i) => ({ id: `m${i}`, text: 'x', x: 0.5, y: 0.5 }));
      const rejected = await request(ctx.app)
        .put(`/api/site-marker/pages/${pageId}/markers`)
        .set(user.auth)
        .send({ markers: tooMany });
      expect(rejected.status).toBe(400);

      const huge = await request(ctx.app)
        .put(`/api/site-marker/pages/${pageId}/markers`)
        .set(user.auth)
        .send({ markers: [{ id: 'm1', text: 'q'.repeat(50_000), x: 0.5, y: 0.5 }] });
      expect(huge.status).toBe(200);
      expect(huge.body.page.markers[0].text.length).toBe(sm.MAX_MARKER_TEXT_LENGTH);
    });

    it('applies the same caps to page comments', async () => {
      const pc = require('../src/storage/pageCommenter');
      const user = await seedUser({ username: 'comment-cap', credits: 1000 });
      const pageId = pc.generatePageCommentId();
      await pc.writePageCommentHtml(user.id, pageId, '<html></html>');
      await pc.writePageCommentMeta(user.id, pageId, {
        id: pageId, url: 'https://x.example/', title: 't', comments: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      const rejected = await request(ctx.app)
        .put(`/api/page-commenter/pages/${pageId}/comments`)
        .set(user.auth)
        .send({ comments: Array.from({ length: 501 }, () => ({ text: 'x' })) });
      expect(rejected.status).toBe(400);
    });
  });

  describe('password change signs other sessions out (A-12)', () => {
    it('invalidates existing refresh tokens', async () => {
      const bcrypt = require('bcrypt');
      const password = 'originalPass123';
      const hash = await bcrypt.hash(password, 4);
      await dbRun(
        `INSERT INTO users (username, email, password_hash, role, credits, credits_refreshed_at)
         VALUES (?, ?, ?, 'business', 100, CURRENT_TIMESTAMP)`,
        ['pwchange', 'pwchange@test.local', hash],
      );
      const login = await request(ctx.app)
        .post('/api/auth/login')
        .send({ username: 'pwchange', password });
      expect(login.status).toBe(200);
      const { token, refreshToken } = login.body;

      const tooShort = await request(ctx.app)
        .post('/api/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ oldPassword: password, newPassword: 'short7c' });
      expect(tooShort.status).toBe(400);

      const changed = await request(ctx.app)
        .post('/api/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ oldPassword: password, newPassword: 'brandNewPass456' });
      expect(changed.status).toBe(200);

      // The refresh token issued before the change must be dead.
      const refresh = await request(ctx.app).post('/api/auth/refresh').send({ refreshToken });
      expect(refresh.status).toBe(401);
    });
  });

  describe('retention sweep (A-07)', () => {
    it('removes old API logs and expired refresh tokens, keeps fresh ones', async () => {
      const { runRetentionSweep, API_LOG_RETENTION_DAYS } = require('../src/services/maintenance');
      const user = await seedUser({ username: 'sweep', credits: 100 });

      await dbRun(
        `INSERT INTO api_request_logs (user_id, service, created_at) VALUES (?, 'old', datetime('now', ?))`,
        [user.id, `-${API_LOG_RETENTION_DAYS + 5} days`],
      );
      await dbRun(
        `INSERT INTO api_request_logs (user_id, service, created_at) VALUES (?, 'fresh', datetime('now', '-1 day'))`,
        [user.id],
      );
      await dbRun(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, 'expired', datetime('now', '-1 day'))`,
        [user.id],
      );
      await dbRun(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, 'live', datetime('now', '+10 days'))`,
        [user.id],
      );

      const summary = await runRetentionSweep();
      expect(summary.apiLogsDeleted).toBeGreaterThanOrEqual(1);
      expect(summary.refreshTokensDeleted).toBeGreaterThanOrEqual(1);

      const logs = await dbGet('SELECT service FROM api_request_logs WHERE user_id = ?', [user.id]);
      expect(logs.service).toBe('fresh');
      const tokens = await dbGet('SELECT token_hash FROM refresh_tokens WHERE user_id = ?', [user.id]);
      expect(tokens.token_hash).toBe('live');
    });

    it('put the new indexes in place', async () => {
      const { dbAll } = require('../src/utils/dbAsync');
      const names = (await dbAll("SELECT name FROM sqlite_master WHERE type = 'index'")).map((r) => r.name);
      for (const idx of [
        'idx_refresh_tokens_token_hash',
        'idx_api_request_logs_user_created',
        'idx_heatmap_reports_user',
        'idx_businesses_user',
        'idx_user_bans_user',
      ]) {
        expect(names, idx).toContain(idx);
      }
    });
  });

  describe('one ban per user (A-13)', () => {
    it('rejects a duplicate ban row at the database', async () => {
      const user = await seedUser({ username: 'dupban', credits: 100 });
      await dbRun('INSERT INTO user_bans (user_id, reason, banned_by) VALUES (?, ?, ?)', [user.id, 'a', 1]);
      await expect(
        dbRun('INSERT INTO user_bans (user_id, reason, banned_by) VALUES (?, ?, ?)', [user.id, 'b', 1]),
      ).rejects.toThrow(/UNIQUE/);
    });
  });

  describe('heatmap snapshot route contract (A-04)', () => {
    it('requires a bearer token — which is why the client must fetch, not iframe-src', async () => {
      const res = await request(ctx.app).get('/api/heatmap/reports/1/html');
      expect(res.status).toBe(401);
    });
  });
});

describe('production env validation (A-11)', () => {
  const boot = (overrides) =>
    spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        CLIENT_ORIGIN: 'https://seo.example.com',
        MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
        JWT_SECRET: 'x'.repeat(40),
        // Ignore any .env file next to the source.
        DOTENV_CONFIG_PATH: '/nonexistent/.env',
        ...overrides,
      },
    });

  it('refuses a short JWT_SECRET', () => {
    const res = boot({ JWT_SECRET: 'short-secret' });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/JWT_SECRET must be at least 32 characters/);
  });

  it('accepts a 32+ character JWT_SECRET', () => {
    const res = boot({});
    expect(res.status, res.stderr).toBe(0);
  });
});
