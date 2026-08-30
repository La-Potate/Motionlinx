import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

// CommonJS helper — load via createRequire so this ESM test file can drive it.
const require = createRequire(import.meta.url);
const { buildTestApp, cleanupTestApp } = require('./helpers/testApp');

/**
 * Regression coverage for two defects found by live endpoint testing on
 * 2026-08-29. Both were invisible to the existing suite because nothing
 * exercised a write path end-to-end.
 */
describe('regressions', () => {
  let ctx;
  let token;

  beforeAll(async () => {
    ctx = await buildTestApp();
    // Migration 003 seeds this admin in non-production when
    // INITIAL_ADMIN_PASSWORD is unset.
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    token = login.body.token;
    expect(token, 'bootstrap admin login should succeed').toBeTruthy();
  });

  afterAll(() => {
    cleanupTestApp(ctx);
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  describe('citation audit create/delete no longer crashes the process', () => {
    // Root cause: create fired callback-less stmt.run() inserts and responded
    // before they landed. Deleting inside that window orphaned the in-flight
    // rows against the audit_id foreign key; node-sqlite3 raised the failure
    // as an unhandled 'error' event on the Statement and killed the process.
    it('writes every source row BEFORE responding', async () => {
      const created = await auth(
        request(ctx.app).post('/api/citation-audit/create'),
      ).send({ businessName: 'Regression Co', country: 'US' });

      expect(created.status).toBe(200);
      const { auditId } = created.body;
      expect(auditId).toBeTruthy();

      // Read immediately — with the old fire-and-forget insert this could
      // observe a partially populated audit.
      const detail = await auth(
        request(ctx.app).get(`/api/citation-audit/${auditId}`),
      );
      expect(detail.status).toBe(200);
      expect(detail.body.results.length).toBe(detail.body.audit.total_citations);
      expect(detail.body.results.length).toBeGreaterThan(0);
    });

    it('survives an immediate delete and keeps serving requests', async () => {
      const created = await auth(
        request(ctx.app).post('/api/citation-audit/create'),
      ).send({ businessName: 'Crash Repro', country: 'US' });
      expect(created.status).toBe(200);

      const del = await auth(
        request(ctx.app).delete(`/api/citation-audit/${created.body.auditId}`),
      );
      expect(del.status).toBe(200);

      // Give any stray async insert a tick to surface, then prove the process
      // is still alive and the audit is really gone.
      await new Promise((resolve) => setTimeout(resolve, 250));

      const health = await request(ctx.app).get('/api/health');
      expect(health.status).toBe(200);

      const gone = await auth(
        request(ctx.app).get(`/api/citation-audit/${created.body.auditId}`),
      );
      expect(gone.status).toBe(404);
    });

    it('rolls back cleanly and leaves no orphan audit on a bad country', async () => {
      const before = await auth(request(ctx.app).get('/api/citation-audit/list'));
      const countBefore = before.body.audits.length;

      // Unknown country falls back to the USA list rather than erroring, so
      // this asserts the fallback still produces a fully populated audit.
      const created = await auth(
        request(ctx.app).post('/api/citation-audit/create'),
      ).send({ businessName: 'Fallback Co', country: 'ZZ' });
      expect(created.status).toBe(200);

      const after = await auth(request(ctx.app).get('/api/citation-audit/list'));
      expect(after.body.audits.length).toBe(countBefore + 1);
    });
  });

  describe('admin user update', () => {
    // Root cause: the handler selected and wrote a `credit_limit` column that
    // no migration creates, so every call returned 500. credit_limit is
    // derived from the user's plan in services/auth.js, not stored per user.
    it('updates a user without touching the non-existent credit_limit column', async () => {
      const created = await auth(request(ctx.app).post('/api/admin/users')).send({
        username: 'regression_user',
        email: 'regression@example.com',
        password: 'testpass123',
        role: 'personal',
      });
      expect(created.status).toBe(200);

      const list = await auth(request(ctx.app).get('/api/admin/users'));
      const target = list.body.find((u) => u.username === 'regression_user');
      expect(target).toBeTruthy();

      const updated = await auth(
        request(ctx.app).put(`/api/admin/users/${target.id}`),
      ).send({ role: 'business' });
      expect(updated.status).toBe(200);

      const after = await auth(request(ctx.app).get(`/api/admin/users/${target.id}`));
      expect(after.status).toBe(200);
      expect(after.body.role).toBe('business');
    });

    it('still rejects an invalid role', async () => {
      const list = await auth(request(ctx.app).get('/api/admin/users'));
      const target = list.body.find((u) => u.username === 'regression_user');

      const res = await auth(
        request(ctx.app).put(`/api/admin/users/${target.id}`),
      ).send({ role: 'not-a-real-level' });
      expect(res.status).toBe(400);
    });

    it('refuses to let an admin demote themselves', async () => {
      const me = await auth(request(ctx.app).post('/api/auth/validate')).send({});
      const res = await auth(request(ctx.app).put(`/api/admin/users/${me.body.id}`)).send({
        role: 'personal',
      });
      expect(res.status).toBe(400);
    });
  });
});
