'use strict';

const crypto = require('crypto');
const logger = require('../utils/logger');
const { dbAll, dbGet, dbRun } = require('../utils/dbAsync');

/**
 * Persistent in-process job queue.
 *
 * Job records live in the SQLite `jobs` table (added in migration 004). At
 * boot, any rows left in `running` are reset to `pending` and re-enqueued —
 * so background work (citation audits, etc.) survives a process restart.
 *
 * Handlers are registered by type via registerHandler(). The queue per type
 * has a concurrency cap (default 1). Handler signature:
 *
 *   async (payload, { signal, reportProgress, jobId }) => any
 *
 *   - `signal` is an AbortSignal that flips when cancel(jobId) is called;
 *     handlers should check `signal.aborted` between async steps.
 *   - `reportProgress(percent, meta?)` updates the live job record (also
 *     persists `progress` + merged `meta` to the DB).
 *
 * Job records older than JOB_TTL_MS (30 min after completion) are GC'd from
 * memory; the row stays in SQLite forever unless cleaned up externally.
 */

const JOB_TTL_MS = 30 * 60 * 1000;

const handlers = new Map(); // type -> { handler, concurrency }
const inflight = new Map(); // jobId -> { abort, _signal }  (live runners only)
const waiting = new Map(); // type -> jobId[]
const running = new Map(); // type -> Set<jobId>

let bootHydrated = false;

function registerHandler(type, handler, { concurrency = 1 } = {}) {
  if (typeof handler !== 'function') {
    throw new TypeError('registerHandler: handler must be a function');
  }
  handlers.set(type, { handler, concurrency: Math.max(1, concurrency) });
  if (!waiting.has(type)) waiting.set(type, []);
  if (!running.has(type)) running.set(type, new Set());
  // Hydrate from DB the first time any handler registers — at that point
  // we know we're past the schema-migrations step in buildApp().
  if (!bootHydrated) {
    bootHydrated = true;
    hydratePendingFromDb().catch((err) =>
      logger.error({ err }, 'Job queue boot hydration failed'),
    );
  } else {
    // A handler registered AFTER boot hydration — pick up any jobs of this
    // type that were already in the DB.
    hydratePendingForType(type).catch((err) =>
      logger.error({ err, type }, 'Failed to hydrate jobs for newly-registered type'),
    );
  }
}

function generateJobId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(12).toString('hex');
}

async function persistInsert(record) {
  await dbRun(
    `INSERT INTO jobs (id, type, status, progress, payload, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      record.id,
      record.type,
      'pending',
      0,
      JSON.stringify(record.payload ?? null),
      record.meta ? JSON.stringify(record.meta) : null,
    ],
  );
}

async function persistUpdate(jobId, fields) {
  const sets = [];
  const args = [];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    args.push(value);
  }
  if (!sets.length) return;
  args.push(jobId);
  await dbRun(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, args);
}

function rowToView(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress,
    payload: safeJsonParse(row.payload),
    meta: safeJsonParse(row.meta),
    result: safeJsonParse(row.result),
    error: row.error,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : null,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
  };
}

function safeJsonParse(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Reset any rows left in `running` to `pending` and re-enqueue them. Called
 * once at boot time.
 */
async function hydratePendingFromDb() {
  await dbRun(
    "UPDATE jobs SET status = 'pending', started_at = NULL WHERE status = 'running'",
  );
  const rows = await dbAll(
    "SELECT id, type FROM jobs WHERE status = 'pending' ORDER BY created_at ASC",
  );
  for (const row of rows) {
    if (handlers.has(row.type)) {
      waiting.get(row.type).push(row.id);
    }
  }
  for (const type of handlers.keys()) {
    setImmediate(() => drain(type));
  }
  if (rows.length) {
    logger.info({ count: rows.length }, 'Job queue hydrated from DB');
  }
}

async function hydratePendingForType(type) {
  const rows = await dbAll(
    "SELECT id FROM jobs WHERE type = ? AND status = 'pending' ORDER BY created_at ASC",
    [type],
  );
  for (const row of rows) waiting.get(type).push(row.id);
  if (rows.length) setImmediate(() => drain(type));
}

function submit(type, payload = {}, { jobId = generateJobId(), meta = null } = {}) {
  const spec = handlers.get(type);
  if (!spec) throw new Error(`No handler registered for job type "${type}"`);
  // Fire the DB insert + enqueue. The caller doesn't need to wait — the
  // queue absorbs the latency. (Returning sync jobId matches the previous API.)
  persistInsert({ id: jobId, type, payload, meta })
    .then(() => {
      waiting.get(type).push(jobId);
      setImmediate(() => drain(type));
    })
    .catch((err) => logger.error({ err, jobId, type }, 'Failed to persist job submission'));
  return jobId;
}

async function getJob(jobId) {
  const row = await dbGet('SELECT * FROM jobs WHERE id = ?', [jobId]);
  return rowToView(row);
}

async function listJobs({ type, status, limit = 100 } = {}) {
  const filters = [];
  const args = [];
  if (type) {
    filters.push('type = ?');
    args.push(type);
  }
  if (status) {
    filters.push('status = ?');
    args.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  args.push(limit);
  const rows = await dbAll(
    `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT ?`,
    args,
  );
  return rows.map(rowToView);
}

async function cancel(jobId) {
  const row = await dbGet('SELECT type, status FROM jobs WHERE id = ?', [jobId]);
  if (!row) return false;
  if (row.status === 'pending') {
    const q = waiting.get(row.type);
    if (q) {
      const idx = q.indexOf(jobId);
      if (idx !== -1) q.splice(idx, 1);
    }
    await persistUpdate(jobId, {
      status: 'cancelled',
      completed_at: new Date().toISOString(),
    });
    return true;
  }
  if (row.status === 'running') {
    const live = inflight.get(jobId);
    if (live) live.abort();
    // Final status flips to cancelled when the handler returns; no DB write here.
    return true;
  }
  return false;
}

function drain(type) {
  const spec = handlers.get(type);
  if (!spec) return;
  const q = waiting.get(type);
  const r = running.get(type);
  while (q.length && r.size < spec.concurrency) {
    const jobId = q.shift();
    r.add(jobId);
    runJob(jobId, type, spec).finally(() => {
      r.delete(jobId);
      drain(type);
      scheduleGc();
    });
  }
}

async function runJob(jobId, type, spec) {
  const controller = new AbortController();
  inflight.set(jobId, { abort: () => controller.abort(), _signal: controller.signal });

  let row;
  try {
    row = await dbGet('SELECT * FROM jobs WHERE id = ?', [jobId]);
  } catch (err) {
    logger.error({ err, jobId }, 'Failed to load job row');
    inflight.delete(jobId);
    return;
  }
  if (!row || row.status === 'cancelled') {
    inflight.delete(jobId);
    return;
  }

  await persistUpdate(jobId, {
    status: 'running',
    started_at: new Date().toISOString(),
  });

  const reportProgress = (percent, meta) => {
    const updates = {};
    if (typeof percent === 'number') {
      updates.progress = Math.max(0, Math.min(100, Math.round(percent)));
    }
    if (meta && typeof meta === 'object') {
      const existing = safeJsonParse(row.meta) || {};
      updates.meta = JSON.stringify({ ...existing, ...meta });
      row.meta = updates.meta;
    }
    if (Object.keys(updates).length) {
      persistUpdate(jobId, updates).catch(() => undefined);
    }
  };

  try {
    const result = await spec.handler(safeJsonParse(row.payload), {
      signal: controller.signal,
      reportProgress,
      jobId,
    });
    const finalStatus = controller.signal.aborted ? 'cancelled' : 'completed';
    await persistUpdate(jobId, {
      status: finalStatus,
      progress: finalStatus === 'completed' ? 100 : row.progress || 0,
      result: result !== undefined ? JSON.stringify(result) : null,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    const aborted = controller.signal.aborted;
    if (!aborted) logger.error({ jobId, type, err }, 'Job failed');
    await persistUpdate(jobId, {
      status: aborted ? 'cancelled' : 'failed',
      error: aborted ? null : err.message || String(err),
      completed_at: new Date().toISOString(),
    });
  } finally {
    inflight.delete(jobId);
  }
}

// ---- GC ----
let gcTimer = null;
function scheduleGc() {
  if (gcTimer) return;
  gcTimer = setTimeout(() => {
    gcTimer = null;
    const cutoffIso = new Date(Date.now() - JOB_TTL_MS).toISOString();
    dbRun(
      `DELETE FROM jobs
       WHERE status IN ('completed', 'failed', 'cancelled')
         AND completed_at IS NOT NULL
         AND completed_at < ?`,
      [cutoffIso],
    ).catch((err) => logger.warn({ err }, 'Job queue GC failed'));
  }, 60 * 1000).unref();
}

module.exports = {
  registerHandler,
  submit,
  cancel,
  getJob,
  listJobs,
};
