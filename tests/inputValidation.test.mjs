import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTestApp, cleanupTestApp, seedUser } = require('./helpers/testApp');

describe('PUT /api/profile', () => {
  let ctx;
  let user;
  let other;
  let dbGet;

  beforeAll(async () => {
    ctx = await buildTestApp();
    ({ dbGet } = require('../src/utils/dbAsync'));
    user = await seedUser({ username: 'alice', credits: 1000 });
    other = await seedUser({ username: 'bob', credits: 1000 });
  });
  afterAll(() => cleanupTestApp(ctx));

  const put = (body) => request(ctx.app).put('/api/profile').set(user.auth).send(body);
  const row = () => dbGet('SELECT username, email, role, credits FROM users WHERE id = ?', [user.id]);

  // Both fields were written unconditionally, so a partial update bound
  // `undefined` and failed with a bare 500.
  it('supports updating just the email', async () => {
    const res = await put({ email: 'moved@test.local' });
    expect(res.status).toBe(200);
    const after = await row();
    expect(after.email).toBe('moved@test.local');
    expect(after.username).toBe('alice');
  });

  it('supports updating just the username', async () => {
    const res = await put({ username: 'alice-renamed' });
    expect(res.status).toBe(200);
    const after = await row();
    expect(after.username).toBe('alice-renamed');
    expect(after.email).toBe('moved@test.local');
  });

  it('rejects an empty body rather than 500ing', async () => {
    const res = await put({});
    expect(res.status).toBe(400);
  });

  // An empty username was accepted and erased the account's login identity -
  // login matches on username OR email, so this could lock someone out.
  it.each([
    ['empty username', { username: '' }],
    ['one-character username', { username: 'x' }],
    ['oversized username', { username: 'q'.repeat(50_000) }],
    ['non-string username', { username: ['a', 'b'] }],
    ['empty email', { email: '' }],
    ['malformed email', { email: 'not-an-email' }],
    ['non-string email', { email: { a: 1 } }],
  ])('rejects %s', async (_label, body) => {
    const before = await row();
    const res = await put(body);
    expect(res.status).toBe(400);
    expect(await row()).toEqual(before);
  });

  it('reports a duplicate email as 400, not 500', async () => {
    const res = await put({ email: other.email });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('ignores role and credits in the payload', async () => {
    const before = await row();
    const res = await put({ username: 'alice-final', role: 'admin', credits: 999_999 });
    expect(res.status).toBe(200);
    const after = await row();
    expect(after.role).toBe(before.role);
    expect(after.credits).toBe(before.credits);
  });
});

describe('PUT /api/admin/users/:id field validation', () => {
  let ctx;
  let admin;
  let target;
  let dbGet;

  beforeAll(async () => {
    ctx = await buildTestApp();
    ({ dbGet } = require('../src/utils/dbAsync'));
    admin = await seedUser({ username: 'root', role: 'admin', credits: 100000 });
    target = await seedUser({ username: 'victim', credits: 1000 });
  });
  afterAll(() => cleanupTestApp(ctx));

  const put = (body) =>
    request(ctx.app).put(`/api/admin/users/${target.id}`).set(admin.auth).send(body);

  // SQLite is dynamically typed, so an unvalidated value was stored verbatim.
  // credits:"abc" reads back as "not a number" everywhere downstream, which
  // silently treats the account as having zero credits.
  it.each([
    ['negative', -5000],
    ['non-numeric string', 'abc'],
    ['absurdly large', 1e308],
    ['null', null],
    ['array', []],
    ['object', { a: 1 }],
  ])('rejects credits: %s', async (_label, credits) => {
    const res = await put({ credits });
    expect(res.status).toBe(400);
    const row = await dbGet('SELECT credits FROM users WHERE id = ?', [target.id]);
    expect(typeof row.credits).toBe('number');
  });

  it('accepts a valid credit value', async () => {
    const res = await put({ credits: 4242 });
    expect(res.status).toBe(200);
    const row = await dbGet('SELECT credits FROM users WHERE id = ?', [target.id]);
    expect(row.credits).toBe(4242);
  });

  it.each([
    ['string', 'yes'],
    ['out-of-range number', 2],
    ['negative', -1],
    ['null', null],
  ])('rejects is_active: %s', async (_label, value) => {
    const res = await put({ is_active: value });
    expect(res.status).toBe(400);
    const row = await dbGet('SELECT is_active FROM users WHERE id = ?', [target.id]);
    expect([0, 1]).toContain(row.is_active);
  });

  it('accepts a boolean is_active', async () => {
    expect((await put({ is_active: false })).status).toBe(200);
    expect((await dbGet('SELECT is_active FROM users WHERE id = ?', [target.id])).is_active).toBe(0);
    expect((await put({ is_active: true })).status).toBe(200);
    expect((await dbGet('SELECT is_active FROM users WHERE id = ?', [target.id])).is_active).toBe(1);
  });

  it('rejects an unknown role', async () => {
    const res = await put({ role: 'superuser' });
    expect(res.status).toBe(400);
  });
});
