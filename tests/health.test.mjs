import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

// CommonJS helper — load via createRequire so this ESM test file can drive it.
const require = createRequire(import.meta.url);
const { buildTestApp, cleanupTestApp } = require('./helpers/testApp');

describe('GET /api/health', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(() => {
    cleanupTestApp(ctx);
  });

  it('returns 200 with status + environment + corsEnabled', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      corsEnabled: true,
    });
    expect(typeof res.body.timestamp).toBe('string');
    expect(typeof res.body.environment).toBe('string');
  });

  it('serves security headers (CSP, X-Frame-Options, Permissions-Policy)', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['permissions-policy']).toContain('camera=()');
  });

  it('serves CSP-Report-Only in dev/test (no unsafe-inline in style-src)', async () => {
    const res = await request(ctx.app).get('/api/health');
    const ro = res.headers['content-security-policy-report-only'];
    expect(ro).toBeTruthy();
    expect(ro).toContain("style-src 'self'");
    expect(ro).not.toContain("'unsafe-inline'");
  });
});

describe('GET /api/health/ready', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });

  afterAll(() => {
    cleanupTestApp(ctx);
  });

  it('returns 200 with healthy db + userdata checks', async () => {
    const res = await request(ctx.app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks).toEqual({ db: 'ok', userdata: 'ok' });
  });
});
