import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTestApp, cleanupTestApp } = require('./helpers/testApp');

/**
 * A-20. `submit()` used to hand back a job id synchronously and persist the
 * row in the background. The two callers store that id in a per-project /
 * per-audit map, so a failed insert left them holding an id that `getJob`
 * would never find and `cancel` could never act on. Submission now resolves
 * only once the row exists, and a failed insert rejects instead.
 */
describe('job queue: the id is only handed out once the row is persisted', () => {
  let ctx;
  let jobQueue;
  let release;

  beforeAll(async () => {
    ctx = await buildTestApp();
    jobQueue = require('../src/jobs/jobQueue');
    // Handler parks until the test lets it finish, so a submitted job is
    // observable in 'pending' or 'running' rather than racing to 'completed'.
    const gate = new Promise((resolve) => { release = resolve; });
    jobQueue.registerHandler('qa_gate', async () => { await gate; return { ok: true }; }, { concurrency: 1 });
  });

  afterAll(async () => {
    release?.();
    await cleanupTestApp(ctx);
  });

  it('resolves with an id whose row already exists', async () => {
    const jobId = await jobQueue.submit('qa_gate', { n: 1 }, { meta: { n: 1 } });
    expect(typeof jobId).toBe('string');
    const job = await jobQueue.getJob(jobId);
    expect(job).toBeTruthy();
    expect(['pending', 'running']).toContain(job.status);
  });

  it('rejects when the insert fails instead of returning a dangling id', async () => {
    const jobId = await jobQueue.submit('qa_gate', { n: 2 });
    // Same primary key again: the insert must fail, and the caller must see it.
    await expect(jobQueue.submit('qa_gate', { n: 3 }, { jobId })).rejects.toThrow();
    const listed = await jobQueue.listJobs({ type: 'qa_gate' });
    expect(listed.filter((j) => j.id === jobId)).toHaveLength(1);
  });

  it('still refuses an unregistered job type up front', async () => {
    await expect(jobQueue.submit('qa_nobody_registered_this')).rejects.toThrow(/No handler registered/);
  });
});
