import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTestApp, cleanupTestApp, seedUser } = require('./helpers/testApp');

/**
 * A freshly signed-up account is `trial` and is sent straight to /pricing. That
 * page reads /api/billing/plans and starts checkout through /api/billing —
 * so those must be reachable for trial accounts, while every tool stays shut.
 *
 * Found by driving the UI: the plans call answered 403 for trial users, the
 * pricing page took that as "Stripe not configured" and disabled checkout, so
 * a trial could never upgrade.
 */
describe('trial account access', () => {
  let ctx;
  let trial;

  beforeAll(async () => {
    ctx = await buildTestApp();
    trial = await seedUser({ username: 'trial-user', role: 'trial', credits: 0 });
  });
  afterAll(() => cleanupTestApp(ctx));

  it('can read the plans on the pricing page', async () => {
    const res = await request(ctx.app).get('/api/billing/plans').set(trial.auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('plans');
    expect(res.body).toHaveProperty('stripeConfigured');
  });

  it('can reach checkout (which then reports Stripe unconfigured here)', async () => {
    const res = await request(ctx.app)
      .post('/api/billing/checkout')
      .set(trial.auth)
      .send({ plan: 'personal' });
    // 503 = Stripe not configured in the test env; the point is it is not 403.
    expect([200, 503]).toContain(res.status);
  });

  it('is still refused every tool and admin route', async () => {
    for (const [method, path] of [
      ['get', '/api/projects'],
      ['get', '/api/citations/entities'],
      ['get', '/api/settings/api-keys'],
      ['get', '/api/admin/users'],
      ['post', '/api/serp/serper-search'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(ctx.app)[method](path).set(trial.auth).send({ query: 'x' });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });
});
