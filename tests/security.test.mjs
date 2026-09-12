import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTestApp, cleanupTestApp, seedUser } = require('./helpers/testApp');

describe('SSRF guard', () => {
  const { isBlockedIp, assertPublicUrl } = require('../src/utils/ssrfGuard');

  // Over-blocking here would break every provider call, so both directions
  // are asserted - not just the addresses we want refused.
  const MUST_BLOCK = [
    '127.0.0.1', '127.1.2.3', '0.0.0.0',
    '10.0.0.1', '10.255.255.254',
    '172.16.0.1', '172.31.255.254',
    '192.168.0.1', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '198.18.0.1',
    '224.0.0.1', '240.0.0.1', '255.255.255.255',
    '192.0.2.5', '198.51.100.5', '203.0.113.5',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:192.168.1.1', '64:ff9b::127.0.0.1',
    'not-an-ip', '',
  ];

  const MUST_ALLOW = [
    '8.8.8.8', '1.1.1.1', '9.9.9.9',
    '142.250.185.78', '160.79.104.10', '104.18.0.1',
    '172.15.255.255', '172.32.0.1', // either side of the RFC1918 /12
    '11.0.0.1', '9.255.255.255', // either side of 10/8
    '100.63.255.255', '100.128.0.1', // either side of CGNAT
    '169.253.255.255', '169.255.0.1', // either side of link-local
    '223.255.255.255', // just below multicast
    '2606:4700:4700::1111', '2001:4860:4860::8888',
  ];

  it.each(MUST_BLOCK)('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(MUST_ALLOW)('allows public address %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it('rejects non-public URLs and non-http schemes', () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://localhost:3000/',
      'http://nas.local/',
      'http://[::1]/',
      'file:///etc/passwd',
      'ftp://example.com',
      'gopher://example.com',
      'not a url',
    ]) {
      expect(() => assertPublicUrl(url), url).toThrow();
    }
  });

  it('accepts ordinary public URLs', () => {
    for (const url of ['https://example.com/a', 'http://example.com', 'https://8.8.8.8/x']) {
      expect(() => assertPublicUrl(url), url).not.toThrow();
    }
  });
});

describe('SSRF guard over HTTP', () => {
  let ctx;
  let user;
  let internal;

  beforeAll(async () => {
    internal = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><title>Internal</title><body>INTERNAL-ONLY-SECRET</body></html>');
    });
    await new Promise((resolve) => internal.listen(0, '127.0.0.1', resolve));
    ctx = await buildTestApp();
    user = await seedUser({ username: 'fetcher', credits: 100000 });
  });

  afterAll(() => {
    internal?.close();
    cleanupTestApp(ctx);
  });

  const internalUrl = () => `http://127.0.0.1:${internal.address().port}/`;

  it('refuses to capture a loopback page and says why', async () => {
    const res = await request(ctx.app)
      .post('/api/site-marker/pages')
      .set(user.auth)
      .send({ url: internalUrl() });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a public internet address/i);
    expect(JSON.stringify(res.body)).not.toContain('INTERNAL-ONLY-SECRET');
  });

  it('refuses page-commenter capture of a loopback page', async () => {
    const res = await request(ctx.app)
      .post('/api/page-commenter/pages')
      .set(user.auth)
      .send({ url: internalUrl() });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('INTERNAL-ONLY-SECRET');
  });

  it('refuses to crawl a loopback host', async () => {
    const res = await request(ctx.app)
      .post('/api/web-search/spider-web')
      .set(user.auth)
      .send({ domain: internalUrl(), crawlLimit: 10 });
    expect(res.status).toBe(400);
  });

  it('gives no port-scan signal: open, closed and LAN look identical', async () => {
    const res = await request(ctx.app)
      .post('/api/web-search/bulk-http')
      .set(user.auth)
      .send({
        urls: [internalUrl(), 'http://127.0.0.1:59999/', 'http://192.168.1.1/'],
      });
    expect(res.status).toBe(200);
    const statuses = (res.body.results || []).map((r) => r.finalStatus);
    expect(statuses).toHaveLength(3);
    // Every internal target must fail the same way, whatever is listening.
    expect(new Set(statuses).size).toBe(1);
    expect(statuses[0]).toBeFalsy();
  });
});

describe('API keys at rest', () => {
  let ctx;
  let alice;
  let bob;

  beforeAll(async () => {
    ctx = await buildTestApp();
    alice = await seedUser({ username: 'alice', credits: 100000 });
    bob = await seedUser({ username: 'bob', credits: 100000 });
  });
  afterAll(() => cleanupTestApp(ctx));

  const SECRET = 'sk-TEST-SECRET-VALUE-4242';

  it('never writes a key to disk in plaintext', async () => {
    const saved = await request(ctx.app)
      .post('/api/settings/api-keys')
      .set(alice.auth)
      .send({ serperApiKey: SECRET });
    expect(saved.status).toBe(200);

    // Walk the whole data directory - the database, the per-user settings.json
    // mirror, everything - and assert the plaintext appears nowhere.
    const hits = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          try {
            if (fs.readFileSync(full).includes(Buffer.from(SECRET))) hits.push(full);
          } catch {
            /* unreadable file, skip */
          }
        }
      }
    };
    walk(ctx.tmpRoot);
    expect(hits).toEqual([]);
  });

  it('still resolves the key for its owner', async () => {
    const { getApiKey } = require('../src/services/apiKeys');
    expect(await getApiKey(alice.id, 'serper')).toBe(SECRET);
  });

  it('does not expose the value to the owner, another user, or an admin', async () => {
    const own = await request(ctx.app).get('/api/settings/api-keys').set(alice.auth);
    expect(own.body.keys.serper.configured).toBe(true);
    expect(own.body.keys.serper.source).toBe('user');
    expect(JSON.stringify(own.body)).not.toContain(SECRET);

    const other = await request(ctx.app).get('/api/settings/api-keys').set(bob.auth);
    expect(other.body.keys.serper.configured).toBe(false);
    expect(JSON.stringify(other.body)).not.toContain(SECRET);
  });

  it('reads a legacy plaintext disk mirror written before encryption', async () => {
    const { getUserDir } = require('../src/storage/userSettings');
    const { getApiKey } = require('../src/services/apiKeys');
    const legacy = await seedUser({ username: 'legacy', credits: 100 });
    fs.writeFileSync(
      path.join(getUserDir(legacy.id), 'settings.json'),
      JSON.stringify({ apiKeys: { serper: 'LEGACY-PLAINTEXT-KEY' } }),
    );
    expect(await getApiKey(legacy.id, 'serper')).toBe('LEGACY-PLAINTEXT-KEY');
  });

  it('decrypts the workspace fallback instead of handing over ciphertext', async () => {
    const { encryptSecret } = require('../src/utils/crypto');
    const { dbGet, dbRun } = require('../src/utils/dbAsync');
    const { getUserDataForSeoCredentials } = require('../src/integrations/dataforseo');

    // The fallback query picks the lowest-id admin.
    const first = await dbGet("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    for (const [key, value] of [
      ['dataForSeo_login', 'WORKSPACE-LOGIN'],
      ['dataForSeo_password', 'WORKSPACE-PASSWORD'],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(
        'INSERT INTO user_settings (user_id, setting_key, setting_value) VALUES (?,?,?)',
        [first.id, key, encryptSecret(value)],
      );
    }

    const creds = await getUserDataForSeoCredentials(bob.id);
    expect(creds.login).toBe('WORKSPACE-LOGIN');
    expect(creds.password).toBe('WORKSPACE-PASSWORD');
    expect(creds.login).not.toMatch(/^enc:v1:/);
  });
});

describe('credit accounting under concurrency', () => {
  let ctx;
  let dbGet;

  beforeAll(async () => {
    ctx = await buildTestApp();
    ({ dbGet } = require('../src/utils/dbAsync'));
  });
  afterAll(() => cleanupTestApp(ctx));

  // Deduction used to SELECT, add the delta in JS, then UPDATE to the computed
  // total, which loses every concurrent spend but one.
  it('applies every concurrent deduction', async () => {
    const { applyCreditChange } = require('../src/services/credits');
    const user = await seedUser({ username: 'spender', credits: 1000 });

    await Promise.all(
      Array.from({ length: 50 }, () => applyCreditChange(user.id, -1, 'usage', {})),
    );

    const row = await dbGet('SELECT credits FROM users WHERE id = ?', [user.id]);
    expect(row.credits).toBe(950);
  });

  it('never lets the balance go negative, even in parallel', async () => {
    const { applyCreditChange } = require('../src/services/credits');
    const user = await seedUser({ username: 'broke', credits: 5 });

    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () =>
        applyCreditChange(user.id, -1, 'usage', {}).then(
          () => 'ok',
          (err) => `rejected:${err.status}`,
        ),
      ),
    );

    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(5);
    expect(outcomes.filter((o) => o === 'rejected:402')).toHaveLength(15);
    const row = await dbGet('SELECT credits FROM users WHERE id = ?', [user.id]);
    expect(row.credits).toBe(0);
  });

  it('charges exactly once per concurrent billable request', async () => {
    const user = await seedUser({ username: 'httpspender', credits: 100 });
    await Promise.all(
      Array.from({ length: 30 }, () =>
        request(ctx.app).get('/api/citations/entities').set(user.auth),
      ),
    );
    // Deduction happens in a res.on('finish') hook, so let it drain.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const row = await dbGet('SELECT credits FROM users WHERE id = ?', [user.id]);
    expect(row.credits).toBe(70);
  });

  it('does not charge for a failed request', async () => {
    const user = await seedUser({ username: 'failer', credits: 100 });
    await request(ctx.app).post('/api/heatmap/reports').set(user.auth).send({});
    await new Promise((resolve) => setTimeout(resolve, 300));

    const row = await dbGet('SELECT credits FROM users WHERE id = ?', [user.id]);
    expect(row.credits).toBe(100);
  });
});
