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

  describe('generated content', () => {
    let pressId;
    let blogId;
    let dbRun;

    beforeAll(async () => {
      ({ dbRun } = require('../src/utils/dbAsync'));
      // Seeded directly: generating these needs a live Anthropic key.
      const press = await dbRun(
        `INSERT INTO press_releases (user_id, website, author, service, content, status)
         VALUES (?,?,?,?,?,?)`,
        [alice.id, 'https://alice.example', 'Alice', 'Plumbing', 'ALICE-PR-BODY', 'ready'],
      );
      const blog = await dbRun(
        `INSERT INTO blog_posts (user_id, website, word_count, topic, content, status)
         VALUES (?,?,?,?,?,?)`,
        [alice.id, 'https://alice.example', 500, 'seo', 'ALICE-BLOG-BODY', 'ready'],
      );
      pressId = press.lastID;
      blogId = blog.lastID;
    });

    it("does not leak another user's generated content", async () => {
      const press = await request(ctx.app)
        .get(`/api/content/press-release/${pressId}`)
        .set(bob.auth);
      expect(press.status).toBe(404);
      expect(JSON.stringify(press.body)).not.toContain('ALICE-PR-BODY');

      const blog = await request(ctx.app).get(`/api/content/blog-post/${blogId}`).set(bob.auth);
      expect(blog.status).toBe(404);
      expect(JSON.stringify(blog.body)).not.toContain('ALICE-BLOG-BODY');
    });

    // The rows were always user-scoped so nothing was ever deleted, but the
    // handler answered `200 {success:true}` regardless of whether anything
    // matched — the client then removed the item from the list for a delete
    // that never happened.
    it('reports 404 rather than success when a delete matches nothing', async () => {
      for (const path of [
        `/api/content/press-release/${pressId}`,
        `/api/content/blog-post/${blogId}`,
      ]) {
        // eslint-disable-next-line no-await-in-loop
        const res = await request(ctx.app).delete(path).set(bob.auth);
        expect(res.status, path).toBe(404);
      }

      const press = await dbGet('SELECT content FROM press_releases WHERE id = ?', [pressId]);
      expect(press?.content).toBe('ALICE-PR-BODY');
    });

    it('still lets the owner delete their own content', async () => {
      const press = await request(ctx.app)
        .delete(`/api/content/press-release/${pressId}`)
        .set(alice.auth);
      expect(press.status).toBe(200);

      const blog = await request(ctx.app)
        .delete(`/api/content/blog-post/${blogId}`)
        .set(alice.auth);
      expect(blog.status).toBe(200);

      expect(await dbGet('SELECT id FROM press_releases WHERE id = ?', [pressId])).toBeFalsy();
      expect(await dbGet('SELECT id FROM blog_posts WHERE id = ?', [blogId])).toBeFalsy();
    });
  });

  describe('rank tracker', () => {
    let businessId;
    let keywordId;

    beforeAll(async () => {
      const biz = await request(ctx.app)
        .post('/api/rankings/businesses')
        .set(alice.auth)
        .send({ name: 'Alice Biz', address: '1 St', website: 'https://alice.example' });
      businessId = biz.body.id;
      const kw = await request(ctx.app)
        .post(`/api/rankings/businesses/${businessId}/keywords`)
        .set(alice.auth)
        .send({ keyword: 'plumber chicago' });
      keywordId = kw.body.keyword?.id ?? kw.body.id;
    });

    it('scopes every business sub-resource to its owner', async () => {
      const paths = [
        ['get', `/api/rankings/businesses/${businessId}/keywords`],
        ['get', `/api/rankings/businesses/${businessId}/competitors`],
        ['get', `/api/rankings/businesses/${businessId}/backlinks`],
        ['get', `/api/rankings/businesses/${businessId}/traffic`],
        ['post', `/api/rankings/businesses/${businessId}/refresh`],
      ];
      for (const [method, path] of paths) {
        // eslint-disable-next-line no-await-in-loop
        const res = await request(ctx.app)[method](path).set(bob.auth);
        expect(res.status, `${method} ${path}`).toBe(404);
      }
    });

    it("scopes keyword routes and leaves the owner's keyword intact", async () => {
      expect(
        (await request(ctx.app).get(`/api/rankings/keywords/${keywordId}/history`).set(bob.auth))
          .status,
      ).toBe(404);
      expect(
        (await request(ctx.app).delete(`/api/rankings/keywords/${keywordId}`).set(bob.auth)).status,
      ).toBe(404);

      const still = await dbGet('SELECT id FROM keywords WHERE id = ?', [keywordId]);
      expect(still).toBeTruthy();
    });
  });
});
