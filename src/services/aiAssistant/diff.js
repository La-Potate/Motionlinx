'use strict';

const crypto = require('crypto');
const { dbAll, dbRun } = require('../../utils/dbAsync');

// Findings are diffed across runs via a stable `dedupe_key`. The shape is
//   sha1(category|type|primary affected URLs sorted)
// so the SAME issue on the SAME URLs in run N+1 collapses onto the open
// row from run N. Anything missing in run N+1 that was open is marked Done.
// Anything new is marked New. Anything that persists keeps Open.

function dedupeKey({ category, type, affectedUrls }) {
  const urls = Array.isArray(affectedUrls) ? [...affectedUrls].sort() : [];
  const h = crypto.createHash('sha1');
  h.update(category || '');
  h.update('|');
  h.update(type || '');
  h.update('|');
  h.update(urls.join(','));
  return h.digest('hex');
}

// `current` = freshly-computed findings for this run (before insertion).
// Each entry: { category, type, severity, impact, title, description, affectedUrls }
async function persistRunWithDiff({ projectId, runId, prevRunId, current }) {
  const prevOpen = prevRunId
    ? await dbAll(
        `SELECT id, dedupe_key, first_seen_run_id FROM analysis_findings
         WHERE project_id = ? AND run_id = ? AND status IN ('open','new')`,
        [projectId, prevRunId],
      )
    : [];
  const prevByKey = new Map(prevOpen.map((row) => [row.dedupe_key, row]));
  const newRows = [];
  const stillOpen = [];
  const seenKeys = new Set();

  for (const finding of current) {
    const key = finding.dedupeKey || dedupeKey(finding);
    seenKeys.add(key);
    const previous = prevByKey.get(key);
    const status = previous ? 'open' : 'new';
    const firstSeenRun = previous ? previous.first_seen_run_id || prevRunId : runId;
    const row = {
      run_id: runId,
      project_id: projectId,
      category: finding.category,
      type: finding.type,
      severity: finding.severity || 'medium',
      impact: typeof finding.impact === 'number' ? finding.impact : 50,
      title: finding.title,
      description: finding.description || null,
      affected_urls_json: JSON.stringify(finding.affectedUrls || []),
      status,
      dedupe_key: key,
      first_seen_run_id: firstSeenRun,
      resolved_run_id: null,
    };
    if (status === 'new') newRows.push(row);
    else stillOpen.push(row);
  }

  // Anything from prev run not in this run → resolved (Done).
  const resolvedRows = [];
  for (const prev of prevOpen) {
    if (seenKeys.has(prev.dedupe_key)) continue;
    resolvedRows.push({
      run_id: runId,
      project_id: projectId,
      category: null, // pulled from prev when needed; we hydrate the read view from the latest run only
      type: null,
      severity: null,
      impact: 0,
      title: null,
      description: null,
      affected_urls_json: '[]',
      status: 'done',
      dedupe_key: prev.dedupe_key,
      first_seen_run_id: prev.first_seen_run_id,
      resolved_run_id: runId,
    });
  }

  // We carry the prior title/category/etc for resolved findings forward so
  // the dashboard can show what was fixed without joining to old runs.
  if (resolvedRows.length) {
    const carry = await dbAll(
      `SELECT id, dedupe_key, category, type, severity, title, description, affected_urls_json
       FROM analysis_findings
       WHERE project_id = ? AND dedupe_key IN (${resolvedRows.map(() => '?').join(',')})
       ORDER BY run_id DESC`,
      [projectId, ...resolvedRows.map((r) => r.dedupe_key)],
    );
    const carryMap = new Map();
    for (const row of carry) {
      if (!carryMap.has(row.dedupe_key)) carryMap.set(row.dedupe_key, row);
    }
    for (const row of resolvedRows) {
      const carried = carryMap.get(row.dedupe_key);
      if (!carried) continue;
      row.category = carried.category;
      row.type = carried.type;
      row.severity = carried.severity;
      row.title = `Resolved: ${carried.title}`;
      row.description = carried.description;
      row.affected_urls_json = carried.affected_urls_json;
    }
  }

  const allRows = [...stillOpen, ...newRows, ...resolvedRows];
  for (const row of allRows) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(
      `INSERT INTO analysis_findings
       (run_id, project_id, category, type, severity, impact, title, description, affected_urls_json,
        status, dedupe_key, first_seen_run_id, resolved_run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.run_id,
        row.project_id,
        row.category,
        row.type,
        row.severity,
        row.impact,
        row.title,
        row.description,
        row.affected_urls_json,
        row.status,
        row.dedupe_key,
        row.first_seen_run_id,
        row.resolved_run_id,
      ],
    );
  }

  return {
    newCount: newRows.length,
    resolvedCount: resolvedRows.length,
    openCount: stillOpen.length,
  };
}

module.exports = { dedupeKey, persistRunWithDiff };
