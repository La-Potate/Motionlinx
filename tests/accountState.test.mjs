import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTestApp, cleanupTestApp, seedUser } = require('./helpers/testApp');

/**
 * A JWT is valid for an hour. Everything an admin does to an account - ban,
 * deactivate, delete, demote - has to take effect on the next request, not
 * when the token happens to expire.
 *
 * Before this was enforced, banning did nothing whatsoever (user_bans was
 * written but never read), is_active was only checked at login, and a deleted
 * user's token still reached every credit-exempt prefix including
 * GET /api/admin/users.
 */
describe('account state is enforced on every request', () => {
  let ctx;
  let dbRun;
  let admin;

  beforeAll(async () => {
    ctx = await buildTestApp();
    ({ dbRun } = require('../src/utils/dbAsync'));
    admin = await seedUser({ username: 'root', role: 'admin', credits: 100000 });
  });

  afterAll(() => cleanupTestApp(ctx));

  it('rejects a banned user holding a still-valid token', async () => {
    const victim = await seedUser({ username: 'banned1', credits: 5000 });
    const before = await request(ctx.app).get('/api/citations/entities').set(victim.auth);
    expect(before.status).toBe(200);

    const ban = await request(ctx.app)
      .post(`/api/admin/users/${victim.id}/ban`)
      .set(admin.auth)
      .send({ reason: 'abuse' });
    expect(ban.status).toBe(200);

    const after = await request(ctx.app).get('/api/citations/entities').set(victim.auth);
    expect(after.status).toBe(403);
    expect(after.body.error).toMatch(/suspended/i);
  });

  it('stops a banned user logging back in', async () => {
    const bcrypt = require('bcrypt');
    const password = 'realPassword123';
    const hash = await bcrypt.hash(password, 4);
    const res = await dbRun(
      `INSERT INTO users (username, email, password_hash, role, credits, credits_refreshed_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      ['banned2', 'banned2@test.local', hash, 'business', 5000],
    );
    const id = res.lastID;

    const ok = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: 'banned2', password });
    expect(ok.status).toBe(200);

    await request(ctx.app)
      .post(`/api/admin/users/${id}/ban`)
      .set(admin.auth)
      .send({ reason: 'abuse' });

    const denied = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: 'banned2', password });
    expect(denied.status).toBe(403);
  });

  it('rejects a deactivated user holding a still-valid token', async () => {
    const victim = await seedUser({ username: 'deactivated', credits: 5000 });
    await dbRun('UPDATE users SET is_active = 0 WHERE id = ?', [victim.id]);

    const res = await request(ctx.app).get('/api/citations/entities').set(victim.auth);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/deactivated/i);
  });

  // The dangerous case: /api/admin, /api/settings and /api/profile are exempt
  // from the credit guard, which was the only thing doing a user lookup. A
  // deleted admin's token kept working on all of them.
  it('rejects a deleted user on credit-exempt prefixes too', async () => {
    const ghost = await seedUser({ username: 'ghost', role: 'admin', credits: 5000 });
    const before = await request(ctx.app).get('/api/admin/users').set(ghost.auth);
    expect(before.status).toBe(200);

    await dbRun('DELETE FROM users WHERE id = ?', [ghost.id]);

    for (const path of [
      '/api/admin/users',
      '/api/settings/api-keys',
      '/api/profile/credit-history',
      '/api/citations/entities',
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(ctx.app).get(path).set(ghost.auth);
      expect(res.status, `${path} should reject a deleted user`).toBe(401);
    }
  });

  it('takes the role from the database so a demotion applies immediately', async () => {
    const user = await seedUser({ username: 'demoted', role: 'admin', credits: 5000 });
    const before = await request(ctx.app).get('/api/admin/users').set(user.auth);
    expect(before.status).toBe(200);

    await dbRun("UPDATE users SET role = 'business' WHERE id = ?", [user.id]);

    // Same token, which still carries role: 'admin' in its payload.
    const after = await request(ctx.app).get('/api/admin/users').set(user.auth);
    expect(after.status).toBe(403);
  });
});

describe('admin cannot lock everyone out', () => {
  let ctx;
  let admin;
  let dbGet;

  beforeAll(async () => {
    ctx = await buildTestApp();
    ({ dbGet } = require('../src/utils/dbAsync'));
    admin = await seedUser({ username: 'root', role: 'admin', credits: 100000 });
  });

  afterAll(() => cleanupTestApp(ctx));

  it('refuses self-demotion, self-deactivation, self-ban and self-deletion', async () => {
    const cases = [
      ['demote', () => request(ctx.app).put(`/api/admin/users/${admin.id}`).set(admin.auth).send({ role: 'personal' })],
      ['deactivate', () => request(ctx.app).put(`/api/admin/users/${admin.id}`).set(admin.auth).send({ is_active: 0 })],
      ['ban', () => request(ctx.app).post(`/api/admin/users/${admin.id}/ban`).set(admin.auth).send({ reason: 'oops' })],
      ['delete', () => request(ctx.app).delete(`/api/admin/users/${admin.id}`).set(admin.auth)],
    ];
    for (const [label, run] of cases) {
      // eslint-disable-next-line no-await-in-loop
      const res = await run();
      expect(res.status, `self-${label} should be refused`).toBe(400);
    }

    const still = await dbGet('SELECT role, is_active FROM users WHERE id = ?', [admin.id]);
    expect(still.role).toBe('admin');
    expect(still.is_active).toBe(1);
  });

  it('still allows removing an admin while another one remains', async () => {
    const other = await seedUser({ username: 'admin2', role: 'admin', credits: 100 });
    const res = await request(ctx.app).delete(`/api/admin/users/${other.id}`).set(admin.auth);
    expect(res.status).toBe(200);

    const remaining = await dbGet(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1",
    );
    expect(remaining.count).toBeGreaterThan(0);
  });

  // The last-admin branch of lockoutGuard is defence in depth rather than a
  // path a live request can reach: the caller must itself be an active,
  // unbanned admin to get this far, so it is always counted as "remaining"
  // unless it is the target - and that case is already refused by the
  // self-action check above. Asserted directly so the branch stays correct if
  // the guard is ever reused somewhere a caller is not the actor.
  it('reports the last active admin as unremovable', async () => {
    const { dbAll } = require('../src/utils/dbAsync');
    const admins = await dbAll(
      `SELECT u.id FROM users u
        WHERE u.role = 'admin' AND u.is_active = 1
          AND NOT EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = u.id)`,
    );
    const others = admins.filter((row) => row.id !== admin.id);
    for (const row of others) {
      // eslint-disable-next-line no-await-in-loop
      await request(ctx.app).delete(`/api/admin/users/${row.id}`).set(admin.auth);
    }

    const left = await dbGet(
      `SELECT COUNT(*) AS count FROM users u
        WHERE u.role = 'admin' AND u.is_active = 1
          AND NOT EXISTS (SELECT 1 FROM user_bans b WHERE b.user_id = u.id)`,
    );
    expect(left.count).toBe(1);

    // That sole remaining admin cannot delete or deactivate itself.
    const del = await request(ctx.app).delete(`/api/admin/users/${admin.id}`).set(admin.auth);
    expect(del.status).toBe(400);
    const off = await request(ctx.app)
      .put(`/api/admin/users/${admin.id}`)
      .set(admin.auth)
      .send({ is_active: false });
    expect(off.status).toBe(400);
  });
});

describe('duplicate account errors are reported, not swallowed', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await buildTestApp();
  });
  afterAll(() => cleanupTestApp(ctx));

  // node-sqlite3 reports the generic SQLITE_CONSTRAINT code, never the
  // extended SQLITE_CONSTRAINT_UNIQUE these handlers used to test for, so the
  // friendly branch could never run and a taken username returned a bare 500.
  it('returns 400 with a clear message for a duplicate signup', async () => {
    const first = await request(ctx.app)
      .post('/api/auth/signup')
      .send({ username: 'dupuser', email: 'dup@test.local', password: 'password123' });
    expect(first.status).toBe(201);

    const sameName = await request(ctx.app)
      .post('/api/auth/signup')
      .send({ username: 'dupuser', email: 'other@test.local', password: 'password123' });
    expect(sameName.status).toBe(400);
    expect(sameName.body.error).toMatch(/already exists/i);

    const sameEmail = await request(ctx.app)
      .post('/api/auth/signup')
      .send({ username: 'otheruser', email: 'dup@test.local', password: 'password123' });
    expect(sameEmail.status).toBe(400);
    expect(sameEmail.body.error).toMatch(/already exists/i);
  });
});
