'use strict';

const gsc = require('../gsc');
const { dbRun } = require('../../utils/dbAsync');

// Pulls a 28-day window from searchAnalytics.query across:
//   - dimensions ['query', 'page'] — for striking-distance + CTR rewrites
//   - dimensions ['page']           — for declining pages
//
// All rows persisted to gsc_performance_cache so subsequent dashboard reads
// avoid a fresh GSC roundtrip.

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function pullPerformance({ accessToken, siteUrl, userId, projectId }) {
  const endDate = isoDaysAgo(2); // GSC perf has a ~2-day lag
  const startDate = isoDaysAgo(30);
  const prevEnd = isoDaysAgo(32);
  const prevStart = isoDaysAgo(60);

  const queryPage = await gsc.querySearchAnalytics({
    accessToken,
    siteUrl,
    startDate,
    endDate,
    dimensions: ['query', 'page'],
    rowLimit: 25000,
    maxRows: 25000,
    userId,
  });
  const pages = await gsc.querySearchAnalytics({
    accessToken,
    siteUrl,
    startDate,
    endDate,
    dimensions: ['page'],
    rowLimit: 25000,
    maxRows: 25000,
    userId,
  });
  const pagesPrev = await gsc.querySearchAnalytics({
    accessToken,
    siteUrl,
    startDate: prevStart,
    endDate: prevEnd,
    dimensions: ['page'],
    rowLimit: 25000,
    maxRows: 25000,
    userId,
  });

  // Persist the current-period query/page rows.
  await dbRun(
    `DELETE FROM gsc_performance_cache WHERE project_id = ? AND start_date = ? AND end_date = ?`,
    [projectId, startDate, endDate],
  );
  for (const row of queryPage) {
    const [query, page] = row.keys || [];
    // eslint-disable-next-line no-await-in-loop
    await dbRun(
      `INSERT INTO gsc_performance_cache
       (project_id, site_url, query, page, start_date, end_date, clicks, impressions, ctr, position, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [projectId, siteUrl, query || '', page || '', startDate, endDate, row.clicks || 0, row.impressions || 0, row.ctr || 0, row.position || 0],
    );
  }

  return { queryPage, pages, pagesPrev };
}

function findingsFromPerformance({ queryPage, pages, pagesPrev }) {
  const findings = [];

  // 1) Striking distance: queries at positions 5–20 with ≥50 impressions but <2% CTR.
  const striking = queryPage
    .filter((r) => r.position >= 4.5 && r.position <= 20.5 && r.impressions >= 50 && (r.ctr || 0) < 0.02)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);
  if (striking.length) {
    findings.push({
      category: 'opportunity',
      type: 'striking_distance',
      severity: 'medium',
      impact: 70,
      title: `${striking.length} striking-distance queries (pos 5–20)`,
      description: 'These queries show meaningful impressions but low CTR — small position gains or title rewrites convert them into clicks.',
      affectedUrls: Array.from(new Set(striking.map((r) => (r.keys || [])[1]).filter(Boolean))).slice(0, 25),
      meta: { sample: striking.slice(0, 10).map((r) => ({ query: (r.keys || [])[0], page: (r.keys || [])[1], pos: r.position, imp: r.impressions, ctr: r.ctr })) },
    });
  }

  // 2) CTR outliers: high impressions, anomalously low CTR → title/meta rewrite candidates.
  const ctrOutliers = queryPage
    .filter((r) => r.impressions >= 200 && (r.ctr || 0) < 0.01 && r.position <= 30)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15);
  if (ctrOutliers.length) {
    findings.push({
      category: 'opportunity',
      type: 'ctr_rewrite',
      severity: 'medium',
      impact: 60,
      title: `${ctrOutliers.length} CTR-rewrite candidates`,
      description: 'High impressions with <1% CTR — title + meta rewrites typically lift these.',
      affectedUrls: Array.from(new Set(ctrOutliers.map((r) => (r.keys || [])[1]).filter(Boolean))).slice(0, 15),
    });
  }

  // 3) Declining pages: clicks down ≥30% period-over-period with prior baseline ≥10 clicks.
  const prevByPage = new Map();
  for (const p of pagesPrev) prevByPage.set((p.keys || [])[0], p);
  const declining = [];
  for (const p of pages) {
    const url = (p.keys || [])[0];
    const prev = prevByPage.get(url);
    if (!url || !prev) continue;
    if ((prev.clicks || 0) < 10) continue;
    const drop = ((prev.clicks - p.clicks) / prev.clicks) || 0;
    if (drop >= 0.3) declining.push({ url, prevClicks: prev.clicks, clicks: p.clicks, drop });
  }
  if (declining.length) {
    declining.sort((a, b) => b.prevClicks - a.prevClicks);
    findings.push({
      category: 'opportunity',
      type: 'declining_pages',
      severity: 'high',
      impact: 70,
      title: `${declining.length} pages with declining clicks`,
      description: 'Clicks dropped ≥30% versus the previous 28-day window. Re-optimise titles, refresh content, or check for ranking losses.',
      affectedUrls: declining.slice(0, 25).map((d) => d.url),
    });
  }

  // 4) Cannibalization: multiple URLs ranking for the same query, both with material clicks.
  const queryToPages = new Map();
  for (const r of queryPage) {
    const [q, p] = r.keys || [];
    if (!q || !p) continue;
    const list = queryToPages.get(q) || [];
    list.push({ page: p, clicks: r.clicks || 0, position: r.position });
    queryToPages.set(q, list);
  }
  const cannibal = [];
  for (const [query, urls] of queryToPages.entries()) {
    if (urls.length < 2) continue;
    const meaningful = urls.filter((u) => u.clicks > 0);
    if (meaningful.length < 2) continue;
    cannibal.push({ query, urls: meaningful.sort((a, b) => b.clicks - a.clicks).slice(0, 5) });
  }
  if (cannibal.length) {
    findings.push({
      category: 'opportunity',
      type: 'cannibalization',
      severity: 'medium',
      impact: 60,
      title: `${cannibal.length} queries served by multiple URLs`,
      description: 'Consolidate or differentiate competing pages — Google may split signals.',
      affectedUrls: Array.from(new Set(cannibal.flatMap((c) => c.urls.map((u) => u.page)))).slice(0, 30),
    });
  }

  return findings;
}

function topPagesByImpressions(pages, n = 50) {
  return [...pages]
    .filter((p) => p.keys && p.keys[0])
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    .slice(0, n)
    .map((p) => p.keys[0]);
}

module.exports = { pullPerformance, findingsFromPerformance, topPagesByImpressions };
