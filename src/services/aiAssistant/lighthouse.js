'use strict';

const dataforseo = require('../../integrations/dataforseo');
const { dbRun, dbGet } = require('../../utils/dbAsync');

const LH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getCached(projectId, url, strategy) {
  const row = await dbGet(
    `SELECT scores_json, audits_json, fetched_at FROM lighthouse_results
     WHERE project_id = ? AND url = ? AND strategy = ?`,
    [projectId, url, strategy],
  );
  if (!row) return null;
  const age = Date.now() - new Date(row.fetched_at).getTime();
  if (age > LH_CACHE_TTL_MS) return null;
  return {
    scores: JSON.parse(row.scores_json || '{}'),
    audits: JSON.parse(row.audits_json || '{}'),
  };
}

async function setCached(projectId, url, strategy, payload) {
  await dbRun(
    `INSERT INTO lighthouse_results (project_id, url, strategy, scores_json, audits_json, fetched_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(project_id, url, strategy)
     DO UPDATE SET scores_json = excluded.scores_json,
                   audits_json = excluded.audits_json,
                   fetched_at = CURRENT_TIMESTAMP`,
    [
      projectId,
      url,
      strategy,
      JSON.stringify(payload.scores || {}),
      JSON.stringify({ metrics: payload.metrics, mobileFriendly: payload.mobileFriendly }),
    ],
  );
}

async function auditUrls({ projectId, urls, creds, strategy = 'mobile', max = 10 }) {
  // Lighthouse is expensive — cap to top `max` URLs (caller picks order).
  const results = [];
  for (const url of urls.slice(0, max)) {
    // eslint-disable-next-line no-await-in-loop
    let cached = await getCached(projectId, url, strategy);
    if (!cached) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const fresh = await dataforseo.fetchLighthouse({ url, strategy }, creds);
        if (fresh) {
          // eslint-disable-next-line no-await-in-loop
          await setCached(projectId, url, strategy, fresh);
          cached = { scores: fresh.scores, audits: { metrics: fresh.metrics, mobileFriendly: fresh.mobileFriendly } };
        }
      } catch (err) {
        // Skip the URL on transient failures; we'll still produce findings
        // from the URLs that worked.
        results.push({ url, error: err.message });
        continue;
      }
    }
    if (cached) results.push({ url, ...cached });
  }
  return results;
}

function summarise(results) {
  const scoresByCat = { performance: [], accessibility: [], bestPractices: [], seo: [] };
  const mobileFails = [];
  const slowLcp = [];
  const badCls = [];
  for (const r of results) {
    if (!r.scores) continue;
    for (const cat of Object.keys(scoresByCat)) {
      if (typeof r.scores[cat] === 'number') scoresByCat[cat].push(r.scores[cat]);
    }
    const mf = r.audits?.mobileFriendly;
    if (mf) {
      const failed = Object.entries(mf).filter(([, ok]) => ok === false).map(([k]) => k);
      if (failed.length) mobileFails.push({ url: r.url, failed });
    }
    const m = r.audits?.metrics;
    if (m && typeof m.lcp === 'number' && m.lcp > 2500) slowLcp.push(r.url);
    if (m && typeof m.cls === 'number' && m.cls > 0.1) badCls.push(r.url);
  }
  const median = (arr) => {
    const a = arr.filter((v) => typeof v === 'number').sort((x, y) => x - y);
    if (!a.length) return null;
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  };
  return {
    median: {
      performance: median(scoresByCat.performance),
      accessibility: median(scoresByCat.accessibility),
      bestPractices: median(scoresByCat.bestPractices),
      seo: median(scoresByCat.seo),
    },
    mobileFails,
    slowLcp,
    badCls,
  };
}

function findingsFromSummary(summary) {
  const findings = [];
  if (summary.slowLcp.length) {
    findings.push({
      category: 'technical',
      type: 'slow_lcp',
      severity: 'high',
      impact: 75,
      title: 'Slow Largest Contentful Paint (>2.5s)',
      description: 'LCP is a Core Web Vital — slow LCP hurts ranking + bounce.',
      affectedUrls: summary.slowLcp.slice(0, 25),
    });
  }
  if (summary.badCls.length) {
    findings.push({
      category: 'technical',
      type: 'bad_cls',
      severity: 'medium',
      impact: 55,
      title: 'Layout shifts above threshold (CLS > 0.1)',
      description: 'CLS is a Core Web Vital; aim for <0.1.',
      affectedUrls: summary.badCls.slice(0, 25),
    });
  }
  if (summary.mobileFails.length) {
    const flat = summary.mobileFails.map((f) => f.url);
    findings.push({
      category: 'technical',
      type: 'mobile_friendliness',
      severity: 'high',
      impact: 70,
      title: 'Mobile-friendliness audits failing',
      description: 'Replaces the dead Mobile-Friendly Test API: derived from Lighthouse viewport, tap-target, font-size, content-width audits.',
      affectedUrls: flat.slice(0, 25),
    });
  }
  return findings;
}

module.exports = { auditUrls, summarise, findingsFromSummary };
