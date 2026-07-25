import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTestApp, cleanupTestApp } = require('./helpers/testApp');

describe('AI Assistant diff layer', () => {
  let ctx;
  let diff;
  let dbAsync;

  beforeAll(async () => {
    ctx = await buildTestApp();
    diff = require('../src/services/aiAssistant/diff');
    dbAsync = require('../src/utils/dbAsync');
    // Seed: one user, one project for the diff.
    await dbAsync.dbRun(
      `INSERT INTO users (username, email, password_hash, role) VALUES ('diffuser', 'd@d.local', 'x', 'admin')`,
    );
    const user = await dbAsync.dbGet(`SELECT id FROM users WHERE username = 'diffuser'`);
    const project = await dbAsync.dbRun(
      `INSERT INTO seo_projects (user_id, name, primary_domain) VALUES (?, 'P1', 'example.com')`,
      [user.id],
    );
    ctx.projectId = project.lastID;
  });

  afterAll(() => {
    cleanupTestApp(ctx);
  });

  it('dedupeKey is stable across runs for the same finding shape', () => {
    const k1 = diff.dedupeKey({ category: 'technical', type: 'missing_title', affectedUrls: ['https://a/', 'https://b/'] });
    const k2 = diff.dedupeKey({ category: 'technical', type: 'missing_title', affectedUrls: ['https://b/', 'https://a/'] });
    expect(k1).toBe(k2);
  });

  it('first run marks every finding as new, second run marks unchanged as open and missing as done', async () => {
    // Run 1
    const run1 = await dbAsync.dbRun(
      `INSERT INTO analysis_runs (project_id, status) VALUES (?, 'running')`,
      [ctx.projectId],
    );
    const run1Id = run1.lastID;
    await diff.persistRunWithDiff({
      projectId: ctx.projectId,
      runId: run1Id,
      prevRunId: null,
      current: [
        {
          category: 'technical', type: 'missing_title', severity: 'high', impact: 80,
          title: 'Missing title tag', affectedUrls: ['https://example.com/a'],
        },
        {
          category: 'technical', type: 'missing_h1', severity: 'high', impact: 70,
          title: 'Missing H1', affectedUrls: ['https://example.com/b'],
        },
      ],
    });
    const after1 = await dbAsync.dbAll(`SELECT status FROM analysis_findings WHERE run_id = ?`, [run1Id]);
    expect(after1.every((row) => row.status === 'new')).toBe(true);
    expect(after1.length).toBe(2);

    // Run 2 — keep the missing_title finding, drop missing_h1, add a new content one.
    const run2 = await dbAsync.dbRun(
      `INSERT INTO analysis_runs (project_id, status, prev_run_id) VALUES (?, 'running', ?)`,
      [ctx.projectId, run1Id],
    );
    const run2Id = run2.lastID;
    await diff.persistRunWithDiff({
      projectId: ctx.projectId,
      runId: run2Id,
      prevRunId: run1Id,
      current: [
        {
          category: 'technical', type: 'missing_title', severity: 'high', impact: 80,
          title: 'Missing title tag', affectedUrls: ['https://example.com/a'],
        },
        {
          category: 'content', type: 'thin_content', severity: 'medium', impact: 50,
          title: 'Thin content', affectedUrls: ['https://example.com/c'],
        },
      ],
    });

    const after2 = await dbAsync.dbAll(`SELECT status, type FROM analysis_findings WHERE run_id = ?`, [run2Id]);
    const byStatus = after2.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    expect(byStatus.open).toBe(1);   // missing_title still present
    expect(byStatus.new).toBe(1);    // thin_content
    expect(byStatus.done).toBe(1);   // missing_h1 disappeared
  });
});
