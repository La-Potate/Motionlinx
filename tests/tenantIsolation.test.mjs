import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTestApp, cleanupTestApp, seedUser } = require('./helpers/testApp');

/**
 * One account must never be able to read, mutate or destroy another's data.
 *
 * Each case here is a bug that was reachable in a shipped build, not a
 * hypothetical. The citation-audit one destroyed real rows across accounts.
 */
describe('tenant isolation', () => {
  let ctx;
  let alice;
  let bob;
  let dbGet;
  let dbAll;

  beforeAll(async () => {
    ctx = await buildTestApp();
    ({ dbGet, dbAll } = require('../src/utils/dbAsync'));
    alice = await seedUser({ username: 'alice', role: 'business', credits: 100000 });
    bob = await seedUser({ username: 'bob', role: 'business', credits: 100000 });
  });

  afterAll(() => cleanupTestApp(ctx));

  describe('citation audits', () => {
    let auditId;

    beforeAll(async () => {
      const created = await request(ctx.app)
        .post('/api/citation-audit/create')
        .set(alice.auth)
        .send({ businessName: 'Alice Co', country: 'US', website: 'https://alice.example' });
      expect(created.status).toBe(200);
      auditId = created.body.auditId;
      expect(auditId).toBeTruthy();
    });

    it('seeds the audit with source rows', async () => {
      const rows = await dbAll(
        'SELECT COUNT(*) AS c FROM citation_audit_results WHERE audit_id = ?',
        [auditId],
      );
      expect(rows[0].c).toBeGreaterThan(0);
    });

    it("hides another user's audit from read and export", async () => {
      const read = await request(ctx.app).get(`/api/citation-audit/${auditId}`).set(bob.auth);
      expect(read.status).toBe(404);
      const exported = await request(ctx.app)
        .get(`/api/citation-audit/${auditId}/export`)
        .set(bob.auth);
      expect(exported.status).toBe(404);
    });

    // The regression: the child rows were keyed only by audit_id and were
    // deleted before any ownership check ran, so this call used to wipe every
    // result row while the user-scoped parent delete matched nothing — the
    // audit survived but was silently emptied.
    it("does not let another user delete the audit's result rows", async () => {
      const before = await dbGet(
        'SELECT COUNT(*) AS c FROM citation_audit_results WHERE audit_id = ?',
        [auditId],
      );

      const res = await request(ctx.app).delete(`/api/citation-audit/${auditId}`).set(bob.auth);
      expect(res.status).toBe(404);

      const after = await dbGet(
        'SELECT COUNT(*) AS c FROM citation_audit_results WHERE audit_id = ?',
        [auditId],
      );
      expect(after.c).toBe(before.c);

      const parent = await dbGet('SELECT id FROM citation_audits WHERE id = ?', [auditId]);
      expect(parent).toBeTruthy();
    });

    it('still lets the owner delete it', async () => {
      const res = await request(ctx.app).delete(`/api/citation-audit/${auditId}`).set(alice.auth);
      expect(res.status).toBe(200);
      const parent = await dbGet('SELECT id FROM citation_audits WHERE id = ?', [auditId]);
      expect(parent).toBeFalsy();
      const kids = await dbGet(
        'SELECT COUNT(*) AS c FROM citation_audit_results WHERE audit_id = ?',
        [auditId],
      );
      expect(kids.c).toBe(0);
    });
  });

  describe('AI Assistant projects', () => {
    let projectId;

    beforeAll(async () => {
      const res = await request(ctx.app)
        .post('/api/ai-assistant/projects')
        .set(alice.auth)
        .send({ name: 'Alice project', siteUrls: ['https://alice.example/'] });
      expect(res.status).toBe(200);
      projectId = res.body.project.id;
    });

    // Had no ownership check at all, and no try/catch — express 4 does not
    // catch a rejected async handler, so a throw left the request hanging.
    it("does not let another user cancel someone else's analysis run", async () => {
      const res = await request(ctx.app)
        .delete(`/api/ai-assistant/projects/${projectId}/runs/current`)
        .set(bob.auth);
      expect(res.status).toBe(404);
    });

    it('lets the owner cancel', async () => {
      const res = await request(ctx.app)
        .delete(`/api/ai-assistant/projects/${projectId}/runs/current`)
        .set(alice.auth);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('cancelled');
    });
  });

  describe('project boards', () => {
    let projectId;

    beforeAll(async () => {
      const res = await request(ctx.app)
        .post('/api/projects')
        .set(alice.auth)
        .send({ name: 'Alice board' });
      projectId = res.body.project?.id ?? res.body.id;
      expect(projectId).toBeTruthy();
    });

    // These queries were always user-scoped so no rows ever leaked, but they
    // answered 200 with an empty array, which a client renders as an empty
    // board rather than "not found".
    it("404s on another user's groups instead of returning an empty list", async () => {
      const res = await request(ctx.app)
        .get(`/api/projects/${projectId}/groups`)
        .set(bob.auth);
      expect(res.status).toBe(404);
    });

    it('leaves the board untouched after a foreign update or delete', async () => {
      await request(ctx.app)
        .put(`/api/projects/${projectId}`)
        .set(bob.auth)
        .send({ name: 'pwned' });
      await request(ctx.app).delete(`/api/projects/${projectId}`).set(bob.auth);

      const row = await dbGet('SELECT name FROM projects WHERE id = ?', [projectId]);
      expect(row?.name).toBe('Alice board');
    });

    it('lets the owner read their own groups', async () => {
      const res = await request(ctx.app)
        .get(`/api/projects/${projectId}/groups`)
        .set(alice.auth);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.groups)).toBe(true);
    });
  });
});
