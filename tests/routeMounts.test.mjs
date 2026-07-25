import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTestApp, cleanupTestApp } = require('./helpers/testApp');

/**
 * Smoke test that every router we mount actually responds. A 401 is the
 * expected "router is mounted + authenticate fires" outcome — what we want to
 * catch is 404 (router not mounted) or 500 (router throws on require).
 */
describe('route mount smoke tests', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(() => {
    cleanupTestApp(ctx);
  });

  // [method, path, allowedStatuses]
  const PROTECTED = [
    ['GET', '/api/admin/users', [401, 403]],
    // /api/profile router has no GET / handler. Hit the explicit auth-gated
    // sub-path instead. (The global /api guard exempts /api/profile from the
    // app-level auth check, so per-route authenticate is what enforces 401.)
    ['GET', '/api/profile/credit-history', [401]],
    ['GET', '/api/citations/list', [401]],
    ['GET', '/api/heatmap/reports', [401]],
    ['GET', '/api/rankings/businesses', [401]],
    ['GET', '/api/settings/api-keys', [401]],
    ['GET', '/api/page-commenter/pages', [401]],
    ['GET', '/api/site-marker/pages', [401]],
    ['GET', '/api/local/locations', [401]],
    ['POST', '/api/schema/autofill', [401]],
    ['POST', '/api/web-search/spider-web', [401]],
    ['POST', '/api/ai-seo/llms/validate', [401]],
    ['POST', '/api/serp/test-google-places', [401]],
    ['POST', '/api/citation-audit/create', [401]],
    ['GET', '/api/content/blog-post/history', [401]],
    // GA4 (AI Traffic Report). The /api/ga4 prefix is exempt from the global
    // auth guard so the OAuth callback can redirect, but the router applies
    // `authenticate` to every other endpoint — unauth requests should be 401.
    ['GET', '/api/ga4/status', [401]],
    ['GET', '/api/ga4/properties', [401]],
    ['POST', '/api/ga4/auth/start', [401]],
    // GSC (AI Assistant). Same pattern as GA4.
    ['GET', '/api/gsc/status', [401]],
    ['GET', '/api/gsc/sites', [401]],
    ['POST', '/api/gsc/auth/start', [401]],
    // AI Assistant project + dashboard.
    ['GET', '/api/ai-assistant/projects', [401]],
  ];

  for (const [method, path, expected] of PROTECTED) {
    it(`${method} ${path} is mounted (expects ${expected.join('|')})`, async () => {
      const req = request(ctx.app)
        [method.toLowerCase()](path)
        .set('Content-Type', 'application/json');
      const res = await (method === 'POST' ? req.send({}) : req);
      expect(
        expected,
        `unexpected status ${res.status} body=${JSON.stringify(res.body)}`,
      ).toContain(res.status);
    });
  }

  it('POST /api/auth/login (public) rejects empty body', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({});
    expect([400, 401]).toContain(res.status);
  });

  it('POST /api/auth/signup (public) rejects empty body', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/signup')
      .set('Content-Type', 'application/json')
      .send({});
    expect([400, 401]).toContain(res.status);
  });

  it('GET /api/site-marker/shared/nonexistent (public + rate-limited) returns 404 or 429', async () => {
    const res = await request(ctx.app).get('/api/site-marker/shared/nonexistent');
    expect([404, 429]).toContain(res.status);
  });

  it('GET /api/ga4/auth/callback (public OAuth redirect) returns 302 even without code', async () => {
    const res = await request(ctx.app).get('/api/ga4/auth/callback');
    // No code/state → redirect back to the client with ?ga4_error=missing_params.
    expect([302]).toContain(res.status);
  });

  it('GET /api/gsc/auth/callback (public OAuth redirect) returns 302 even without code', async () => {
    const res = await request(ctx.app).get('/api/gsc/auth/callback');
    expect([302]).toContain(res.status);
  });

  it('unknown /api path triggers global auth guard (401)', async () => {
    const res = await request(ctx.app).get('/api/this-route-does-not-exist');
    expect([401, 404]).toContain(res.status);
  });
});
