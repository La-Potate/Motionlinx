import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTestApp, cleanupTestApp, seedUser } = require('./helpers/testApp');

/**
 * The OAuth `state` proves which user started the flow. It must ALSO be bound
 * to the browser that finishes it, or an attacker can start a flow, hand the
 * Google URL to a victim, and have the victim's Google tokens saved under the
 * attacker's account. The binding is a nonce cookie set at /auth/start and
 * required to match the state at the callback.
 */
for (const app of [
  { prefix: '/api/ga4', cookie: 'ga4_oauth_nonce', errKey: 'ga4_error', okKey: 'ga4_connected' },
  { prefix: '/api/gsc', cookie: 'gsc_oauth_nonce', errKey: 'gsc_error', okKey: 'gsc_connected' },
]) {
  describe(`${app.prefix} OAuth state is bound to the starting browser`, () => {
    let ctx;
    let user;
    let startRes;
    let state;
    let cookie;

    beforeAll(async () => {
      ctx = await buildTestApp();
      const { setSystemApiKey } = require('../src/storage/systemSettings');
      // The flow refuses to start without a configured OAuth client.
      setSystemApiKey('googleOauthClientId', 'test-client-id.apps.googleusercontent.com');
      setSystemApiKey('googleOauthClientSecret', 'test-client-secret');
      user = await seedUser({ username: `oauth-${app.prefix.slice(5)}`, credits: 100 });

      startRes = await request(ctx.app).post(`${app.prefix}/auth/start`).set(user.auth);
      expect(startRes.status).toBe(200);
      state = new URL(startRes.body.url).searchParams.get('state');
      expect(state).toBeTruthy();

      const setCookie = startRes.headers['set-cookie'] || [];
      const line = setCookie.find((c) => c.startsWith(`${app.cookie}=`));
      expect(line, 'start must set the nonce cookie').toBeTruthy();
      cookie = line.split(';')[0];
      expect(line).toMatch(/HttpOnly/i);
      expect(line).toMatch(/SameSite=Lax/i);
    });

    afterAll(() => cleanupTestApp(ctx));

    const callback = (extra = {}) =>
      request(ctx.app)
        .get(`${app.prefix}/auth/callback`)
        .query({ code: 'bogus-code', state })
        .set(extra);

    it('refuses a valid state presented without the nonce cookie', async () => {
      // This is the attack: the state is genuine (it was minted for `user`),
      // but the browser presenting it never started the flow.
      const res = await callback();
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(`${app.errKey}=invalid_state`);
    });

    it('refuses a state presented with a different nonce cookie', async () => {
      const res = await callback({ Cookie: `${app.cookie}=0000000000000000ffffffffffffffff` });
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(`${app.errKey}=invalid_state`);
    });

    it('lets the matching cookie past the state check', async () => {
      const res = await callback({ Cookie: cookie });
      expect(res.status).toBe(302);
      // With a bogus code the exchange itself fails — but the state gate has
      // been passed, which is the property under test.
      expect(res.headers.location).not.toContain('invalid_state');
      expect(res.headers.location).toMatch(new RegExp(`${app.errKey}=exchange_failed|${app.okKey}=1`));
    });

    it('saved no tokens for the rejected attempts', async () => {
      const { dbAll } = require('../src/utils/dbAsync');
      const rows = await dbAll(
        `SELECT setting_key FROM user_settings WHERE user_id = ? AND setting_key LIKE ?`,
        [user.id, `${app.prefix.slice(5)}_%token`],
      );
      expect(rows).toEqual([]);
    });
  });
}
