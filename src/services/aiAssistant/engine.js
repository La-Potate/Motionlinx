'use strict';

const logger = require('../../utils/logger');
const { dbAll, dbGet, dbRun } = require('../../utils/dbAsync');
const dataforseo = require('../../integrations/dataforseo');
const aiSeo = require('../aiSeo');
const gsc = require('../gsc');

const urlSet = require('./url-set');
const technical = require('./technical');
const performance = require('./performance');
const lighthouseMod = require('./lighthouse');
const keywords = require('./keywords');
const linking = require('./internal-linking');
const geoScore = require('./geo-score');
const scoring = require('./scoring');
const diff = require('./diff');

// Orchestrator. Called from the job handler with a project + the user's
// access token + DataForSEO creds. Writes:
//   - analysis_runs row (status + scores + summary)
//   - analysis_findings rows (diffed against prev_run_id)
//   - cache tables (onpage_pages, lighthouse_results, url_inspections,
//     internal_link_edges, keyword_research_cache, gsc_sitemaps)
//
// Phases (with a coarse percentage budget for reportProgress):
//   0..5    setup
//   5..15   sitemap + sites + GSC perf
//   15..50  on-page crawl
//   50..65  URL inspection (cap at 50 URLs / run)
//   65..80  Lighthouse (cap at 10 URLs / run)
//   80..90  keyword research + GEO signals
//   90..100 scoring + diff + persist

const MAX_INSPECT_PER_RUN = 50;
const MAX_LIGHTHOUSE_PER_RUN = 10;
const MAX_CRAWL_PAGES = 200;

async function runAnalysis({ projectId, accessToken, dfsCreds, signal, reportProgress }) {
  const project = await dbGet(
    `SELECT id, user_id, name, primary_domain FROM seo_projects WHERE id = ?`,
    [projectId],
  );
  if (!project) throw new Error('project_not_found');

  const propsRows = await dbAll(
    `SELECT site_url FROM seo_project_properties WHERE project_id = ? ORDER BY site_url ASC`,
    [projectId],
  );
  const properties = propsRows.map((r) => r.site_url);
  if (!properties.length) throw new Error('no_properties_mapped');

  const prevRun = await dbGet(
    `SELECT id FROM analysis_runs WHERE project_id = ? AND status = 'completed' ORDER BY id DESC LIMIT 1`,
    [projectId],
  );
  const prevRunId = prevRun?.id || null;

  const runInsert = await dbRun(
    `INSERT INTO analysis_runs (project_id, status, started_at, prev_run_id) VALUES (?, 'running', CURRENT_TIMESTAMP, ?)`,
    [projectId, prevRunId],
  );
  const runId = runInsert.lastID;

  const findings = [];
  const phase = (pct, meta) => reportProgress?.(pct, meta);

  try {
    phase(5, { phase: 'setup' });
    if (signal?.aborted) throw new Error('aborted');

    // Pick the primary site (first property) for hostname / crawl target. We
    // still call GSC against every mapped property where it makes sense.
    const primaryProperty = properties[0];
    const hostname = hostnameFromSiteUrl(primaryProperty) || project.primary_domain;
    if (!hostname) throw new Error('cannot_derive_hostname');

    // 1) Sitemaps + sitemap-gate persist.
    phase(8, { phase: 'sitemaps' });
    const sitemapsByProperty = {};
    let hasAnySitemap = false;
    for (const property of properties) {
      // eslint-disable-next-line no-await-in-loop
      const sm = await gsc.listSitemaps({ accessToken, siteUrl: property, userId: project.user_id }).catch(() => []);
      sitemapsByProperty[property] = sm;
      if (sm.length) hasAnySitemap = true;
      await persistSitemaps(projectId, property, sm);
    }

    // 2) Live sitemap parse (URL inventory). We use the existing helper that
    //    handles nested sitemaps + http fallback.
    const sitemapUrls = [];
    if (hasAnySitemap) {
      const sm = await aiSeo.fetchSitemapUrls(hostname, 500).catch(() => null);
      if (sm?.urls?.length) sitemapUrls.push(...sm.urls);
    }

    // 3) GSC performance (28-day + prior period for declines).
    phase(15, { phase: 'gsc_performance' });
    const perfByProperty = {};
    for (const property of properties) {
      // eslint-disable-next-line no-await-in-loop
      const perf = await performance
        .pullPerformance({ accessToken, siteUrl: property, userId: project.user_id, projectId })
        .catch((err) => {
          logger.warn({ err: err.message, property }, 'GSC performance pull failed');
          return null;
        });
      if (perf) perfByProperty[property] = perf;
    }
    const allQueryPage = [].concat(...Object.values(perfByProperty).map((p) => p.queryPage || []));
    const allPages = [].concat(...Object.values(perfByProperty).map((p) => p.pages || []));
    const allPagesPrev = [].concat(...Object.values(perfByProperty).map((p) => p.pagesPrev || []));
    const gscTopPages = performance.topPagesByImpressions(allPages, 100);

    findings.push(...performance.findingsFromPerformance({ queryPage: allQueryPage, pages: allPages, pagesPrev: allPagesPrev }));

    if (signal?.aborted) throw new Error('aborted');

    // 4) On-page crawl (DataForSEO).
    phase(20, { phase: 'on_page_crawl' });
    let crawlResult = { taskId: null, summary: null, pages: [], links: [] };
    if (dfsCreds?.login && dfsCreds?.password) {
      crawlResult = await technical
        .runOnPageCrawl({ siteUrl: primaryProperty, maxCrawlPages: MAX_CRAWL_PAGES, creds: dfsCreds })
        .catch((err) => {
          logger.warn({ err: err.message }, 'On-page crawl failed');
          return { taskId: null, summary: null, pages: [], links: [] };
        });
    }
    await persistOnPagePages(projectId, crawlResult.pages);
    await linking.persist({ projectId, links: crawlResult.links });

    const crawlUrls = (crawlResult.pages || []).map((p) => p.url).filter(Boolean);

    // 5) Build canonical URL set (sitemap ∪ GSC top pages ∪ crawl).
    const { urls: canonicalUrls } = urlSet.buildUrlSet({
      sitemapUrls,
      gscPages: gscTopPages,
      crawlUrls,
      limit: 200,
    });

    findings.push(...technical.findingsFromOnPagePages(crawlResult.pages, canonicalUrls));

    if (signal?.aborted) throw new Error('aborted');

    // 6) URL Inspection (capped).
    phase(50, { phase: 'url_inspection' });
    const inspectionTargets = canonicalUrls.slice(0, MAX_INSPECT_PER_RUN);
    const inspections = [];
    for (const url of inspectionTargets) {
      if (signal?.aborted) break;
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await gsc.inspectUrl({ accessToken, siteUrl: primaryProperty, url, userId: project.user_id });
        inspections.push({ url, result });
        // eslint-disable-next-line no-await-in-loop
        await persistInspection(projectId, primaryProperty, url, result);
      } catch (err) {
        logger.warn({ url, err: err.message }, 'URL inspection failed');
      }
    }
    findings.push(...technical.findingsFromUrlInspections(inspections));

    // 7) Lighthouse on the top-impression URLs.
    phase(65, { phase: 'lighthouse' });
    const lhUrls = gscTopPages.length ? gscTopPages.slice(0, MAX_LIGHTHOUSE_PER_RUN) : canonicalUrls.slice(0, MAX_LIGHTHOUSE_PER_RUN);
    let lhSummary = { median: { performance: null, accessibility: null, bestPractices: null, seo: null }, mobileFails: [], slowLcp: [], badCls: [] };
    if (dfsCreds?.login && dfsCreds?.password && lhUrls.length) {
      const lhResults = await lighthouseMod.auditUrls({ projectId, urls: lhUrls, creds: dfsCreds, max: MAX_LIGHTHOUSE_PER_RUN });
      lhSummary = lighthouseMod.summarise(lhResults);
      findings.push(...lighthouseMod.findingsFromSummary(lhSummary));
    }

    if (signal?.aborted) throw new Error('aborted');

    // 8) Keyword research (Labs).
    phase(80, { phase: 'keywords' });
    const seedKeywords = Array.from(new Set(allQueryPage.slice(0, 50).map((r) => (r.keys || [])[0]).filter(Boolean)));
    let keywordRes = { ranked: [], competitors: [], ideas: [], gap: [], aiKeywords: [], topCompetitor: null };
    if (dfsCreds?.login && dfsCreds?.password) {
      keywordRes = await keywords
        .pullKeywordResearch({
          projectId,
          domainTarget: hostname,
          locationCode: 2840,
          languageCode: 'en',
          seedKeywords,
          creds: dfsCreds,
        })
        .catch((err) => {
          logger.warn({ err: err.message }, 'Keyword research failed');
          return { ranked: [], competitors: [], ideas: [], gap: [], aiKeywords: [], topCompetitor: null };
        });
    }
    findings.push(...keywords.findingsFromKeywordResearch(keywordRes));

    // 9) Internal-link suggestions.
    const linkGraph = linking.buildGraph(crawlResult.links, canonicalUrls);
    const orphans = linking.findOrphans(linkGraph.inbound, canonicalUrls);
    const opportunityTargets = Array.from(new Set(
      findings.filter((f) => f.type === 'striking_distance').flatMap((f) => f.affectedUrls || []),
    ));
    const linkSuggestions = linking.buildSuggestions({
      inbound: linkGraph.inbound,
      outbound: linkGraph.outbound,
      opportunityUrls: opportunityTargets,
      urls: canonicalUrls,
    });
    findings.push(...linking.findingsFromGraph({ orphans, suggestions: linkSuggestions }));

    // 10) GEO signals.
    phase(88, { phase: 'geo' });
    const geoSignals = await geoScore.computeGeoSignals({ hostname, pages: crawlResult.pages });
    findings.push(...geoScore.findingsFromGeoSignals(geoSignals));

    // 11) Sitemap gate finding (last so it ranks top of the dashboard if active).
    if (!hasAnySitemap) {
      findings.unshift({
        category: 'technical',
        type: 'no_sitemap',
        severity: 'critical',
        impact: 100,
        title: 'No sitemap submitted',
        description: 'GSC has no sitemap for this property. Full analysis is gated until a sitemap is submitted.',
        affectedUrls: [],
      });
    }

    // 12) Compute scores.
    phase(95, { phase: 'scoring' });
    const indexed = inspections.filter((i) => i.result?.indexStatusResult?.verdict === 'PASS').length;
    const indexability = inspections.length ? indexed / inspections.length : null;
    const issuesPerPage = (crawlResult.pages || []).reduce((sum, p) => sum + (Number(p.total_dom_size) > 0 ? 1 : 0), 0);
    const onPage = crawlResult.pages?.length ? 1 - Math.min(1, issuesPerPage / Math.max(1, crawlResult.pages.length) / 2) : null;
    const statusHealth = crawlResult.summary
      ? Math.max(0, 1 - (crawlResult.summary.checks?.broken_links || 0) / Math.max(1, crawlResult.summary.crawl_progress?.crawled_pages || 1))
      : null;

    const technicalCard = scoring.computeTechnical({
      indexability,
      onPage,
      lighthouse: lhSummary.median,
      statusHealth,
    });
    const contentCard = scoring.computeContent({
      titlesMeta: computeTitlesMetaScore(crawlResult.pages),
      headings: computeHeadingsScore(crawlResult.pages),
      wordCount: computeWordCountScore(crawlResult.pages),
      schema: geoSignals.schemaQuality,
    });
    const geoCard = scoring.computeGeo(geoSignals);
    const overall = scoring.computeOverall({
      technical: technicalCard.score,
      content: contentCard.score,
      geo: geoCard.score,
    });

    const summary = buildSummary({
      hasAnySitemap,
      findings,
      properties,
      crawled: crawlResult.summary?.crawl_progress?.crawled_pages || (crawlResult.pages || []).length,
      inspectionCount: inspections.length,
      lighthouseCount: lhUrls.length,
    });

    phase(98, { phase: 'persist' });
    await diff.persistRunWithDiff({ projectId, runId, prevRunId, current: findings });

    await dbRun(
      `UPDATE analysis_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
       scores_json = ?, summary_json = ?, url_count = ?
       WHERE id = ?`,
      [
        JSON.stringify({
          overall,
          technical: { score: technicalCard.score, breakdown: technicalCard.breakdown },
          content: { score: contentCard.score, breakdown: contentCard.breakdown },
          geo: { score: geoCard.score, breakdown: geoCard.breakdown },
        }),
        JSON.stringify(summary),
        canonicalUrls.length,
        runId,
      ],
    );
    await dbRun(`UPDATE seo_projects SET last_run_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [runId, projectId]);

    phase(100, { phase: 'done' });
    return { runId, overall, technical: technicalCard.score, content: contentCard.score, geo: geoCard.score };
  } catch (err) {
    const aborted = signal?.aborted || err.message === 'aborted';
    await dbRun(
      `UPDATE analysis_runs SET status = ?, completed_at = CURRENT_TIMESTAMP, error = ? WHERE id = ?`,
      [aborted ? 'cancelled' : 'failed', aborted ? null : (err.message || String(err)).slice(0, 500), runId],
    );
    throw err;
  }
}

// ---- helpers ------------------------------------------------------------
function hostnameFromSiteUrl(siteUrl) {
  if (!siteUrl) return null;
  if (siteUrl.startsWith('sc-domain:')) return siteUrl.slice('sc-domain:'.length);
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return null;
  }
}

function computeTitlesMetaScore(pages) {
  if (!Array.isArray(pages) || !pages.length) return null;
  let ok = 0;
  for (const p of pages) {
    const onPage = p.on_page || p.meta || {};
    const titleOk = typeof onPage.title === 'string' && onPage.title.trim().length >= 25 && onPage.title.trim().length <= 65;
    const metaOk = typeof onPage.description === 'string' && onPage.description.trim().length >= 50 && onPage.description.trim().length <= 165;
    if (titleOk && metaOk) ok += 1;
  }
  return ok / pages.length;
}

function computeHeadingsScore(pages) {
  if (!Array.isArray(pages) || !pages.length) return null;
  let ok = 0;
  for (const p of pages) {
    const onPage = p.on_page || p.meta || {};
    const h1 = Array.isArray(onPage.h1) ? onPage.h1.length : 0;
    const h2 = Array.isArray(onPage.h2) ? onPage.h2.length : 0;
    if (h1 === 1 && h2 >= 2) ok += 1;
  }
  return ok / pages.length;
}

function computeWordCountScore(pages) {
  if (!Array.isArray(pages) || !pages.length) return null;
  let sum = 0;
  let n = 0;
  for (const p of pages) {
    const onPage = p.on_page || p.meta || {};
    const words = onPage.plain_text_word_count || 0;
    if (!words) continue;
    sum += Math.min(1, words / 1500);
    n += 1;
  }
  return n ? sum / n : null;
}

function buildSummary({ hasAnySitemap, findings, properties, crawled, inspectionCount, lighthouseCount }) {
  const reasons = [];
  if (!hasAnySitemap) reasons.push('No sitemap submitted — coverage limited to GSC top pages.');
  reasons.push(`Crawled ${crawled} URLs across ${properties.length} mapped propert${properties.length === 1 ? 'y' : 'ies'}.`);
  reasons.push(`Inspected ${inspectionCount} URLs against GSC's index.`);
  reasons.push(`Ran Lighthouse on ${lighthouseCount} top-traffic URLs.`);
  const findingsByCategory = findings.reduce((acc, f) => {
    acc[f.category] = (acc[f.category] || 0) + 1;
    return acc;
  }, {});
  return { reasons, findingsByCategory };
}

async function persistSitemaps(projectId, siteUrl, sitemaps) {
  await dbRun(`DELETE FROM gsc_sitemaps WHERE project_id = ? AND site_url = ?`, [projectId, siteUrl]);
  for (const s of sitemaps) {
    // eslint-disable-next-line no-await-in-loop
    await dbRun(
      `INSERT INTO gsc_sitemaps (project_id, site_url, sitemap_url, last_submitted, last_downloaded, warnings, errors, contents_count, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        projectId,
        siteUrl,
        s.path || s.feedpath || '',
        s.lastSubmitted || null,
        s.lastDownloaded || null,
        Number(s.warnings || 0),
        Number(s.errors || 0),
        Number(s.contents?.[0]?.submitted || 0),
      ],
    );
  }
}

async function persistOnPagePages(projectId, pages) {
  if (!pages?.length) return;
  await dbRun(`DELETE FROM onpage_pages WHERE project_id = ?`, [projectId]);
  for (const p of pages) {
    const onPage = p.on_page || p.meta || {};
    const url = p.url || '';
    if (!url) continue;
    // eslint-disable-next-line no-await-in-loop
    await dbRun(
      `INSERT INTO onpage_pages (project_id, url, status_code, title, meta_description, h1, word_count, issues_json, result_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(project_id, url) DO UPDATE SET
         status_code = excluded.status_code,
         title = excluded.title,
         meta_description = excluded.meta_description,
         h1 = excluded.h1,
         word_count = excluded.word_count,
         issues_json = excluded.issues_json,
         result_json = excluded.result_json,
         fetched_at = CURRENT_TIMESTAMP`,
      [
        projectId,
        url,
        p.status_code || null,
        (onPage.title || '').slice(0, 500),
        (onPage.description || '').slice(0, 1000),
        Array.isArray(onPage.h1) ? (onPage.h1[0] || '').slice(0, 500) : null,
        onPage.plain_text_word_count || 0,
        JSON.stringify(p.checks || {}),
        JSON.stringify(p),
      ],
    );
  }
}

async function persistInspection(projectId, siteUrl, url, result) {
  await dbRun(
    `INSERT INTO url_inspections (project_id, site_url, url, result_json, fetched_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(project_id, url) DO UPDATE SET
       result_json = excluded.result_json,
       fetched_at = CURRENT_TIMESTAMP`,
    [projectId, siteUrl, url, JSON.stringify(result || null)],
  );
}

module.exports = { runAnalysis };
