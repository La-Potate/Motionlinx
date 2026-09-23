import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Stripe must be "configured" before the app module graph loads, because the
// integration instantiates the client at require time. The key is fake; every
// call below is offline (signature construction and local DB writes only).
process.env.STRIPE_SECRET_KEY = 'sk_test_offline_only_000000000000000000';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_offline_only_0000000000000000';

const { buildTestApp, cleanupTestApp, seedUser } = require('./helpers/testApp');

describe('Stripe webhook idempotency', () => {
  let ctx;
  let user;
  let stripe;
  let dbGet;

  beforeAll(async () => {
    ctx = await buildTestApp();
    ({ stripe } = require('../src/integrations/stripe'));
    ({ dbGet } = require('../src/utils/dbAsync'));
    user = await seedUser({ username: 'payer', credits: 100 });
  });

  afterAll(() => cleanupTestApp(ctx));

  const balance = async () => (await dbGet('SELECT credits FROM users WHERE id = ?', [user.id])).credits;

  const deliver = (payload) => {
    const body = JSON.stringify(payload);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    return request(ctx.app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(body);
  };

  const topupEvent = (id) => ({
    id,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        object: 'checkout.session',
        mode: 'payment',
        status: 'complete',
        payment_intent: 'pi_test_1',
        customer: null,
        subscription: null,
        metadata: { userId: String(user.id), type: 'topup' },
      },
    },
  });

  it('grants a top-up exactly once when Stripe redelivers the same event', async () => {
    const before = await balance();

    const first = await deliver(topupEvent('evt_test_topup_1'));
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });
    const afterFirst = await balance();
    expect(afterFirst).toBe(before + 1000);

    // Stripe retries on any non-2xx and can also deliver duplicates outright.
    // This used to credit another 1000.
    const second = await deliver(topupEvent('evt_test_topup_1'));
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(await balance()).toBe(afterFirst);
  });

  it('still processes a genuinely new event', async () => {
    const before = await balance();
    const res = await deliver(topupEvent('evt_test_topup_2'));
    expect(res.status).toBe(200);
    expect(await balance()).toBe(before + 1000);
  });

  it('rejects a tampered body', async () => {
    const payload = topupEvent('evt_test_topup_3');
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: JSON.stringify(payload),
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
    payload.data.object.metadata.userId = String(user.id + 1);
    const before = await balance();
    const res = await request(ctx.app)
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(JSON.stringify(payload));
    expect(res.status).toBe(400);
    expect(await balance()).toBe(before);
  });

  it('records processed event ids', async () => {
    const rows = await dbGet('SELECT COUNT(*) AS c FROM stripe_webhook_events');
    expect(rows.c).toBe(2);
  });
});
