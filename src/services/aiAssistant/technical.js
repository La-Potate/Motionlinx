'use strict';

const dataforseo = require('../../integrations/dataforseo');

// Technical-SEO checks. Driven by:
//   - DataForSEO On-Page result (per-URL issues, status codes, titles, headings, schema)
//   - GSC URL Inspection result (indexed verdict, canonical, robots blocks)
//
// Produces an array of finding-shaped objects ready for the diff layer.

function findingsFromOnPagePages(pages, projectUrls) {
  const findings = [];
  if (!Array.isArray(pages) || !pages.length) return findings;

  // Group issues across URLs so the dashboard shows "X pages have missing
  // titles" rather than X duplicate findings.
  const groups = new Map();
  const push = (type, severity, title, description, url, impact = 50) => {
    const g = groups.get(type) || { type, severity, title, description, urls: [], impact };
    g.urls.push(url);
    groups.set(type, g);
  };

  for (const page of pages) {
    const url = page.url || page.page_url || '';
    if (!url) continue;
    const meta = page.meta || {};
    const checks = page.checks || {};
    const onPage = page.on_page || meta;
    const status = page.status_code ?? meta.status_code;

    if (typeof status === 'number' && status >= 400) {
      push(
        `status_${status >= 500 ? '5xx' : '4xx'}`,
        status >= 500 ? 'critical' : 'high',
        `${status >= 500 ? 'Server' : 'Client'} error responses`,
        `Pages returning HTTP ${status} won't be indexed.`,
        url,
        status >= 500 ? 90 : 80,
      );
    }
    if (!onPage.title || (typeof onPage.title === 'string' && !onPage.title.trim())) {
      push('missing_title', 'high', 'Missing or empty title tag', 'Title tags are a primary SEO signal.', url, 80);
    } else if (typeof onPage.title === 'string') {
      const t = onPage.title.trim();
      if (t.length < 25) push('short_title', 'medium', 'Title too short', 'Aim for 50–60 characters.', url, 50);
      else if (t.length > 65) push('long_title', 'low', 'Title likely truncated in SERPs', 'Aim for 50–60 characters.', url, 30);
    }
    if (!onPage.description) {
      push('missing_meta', 'medium', 'Missing meta description', 'Affects CTR even when ignored for ranking.', url, 50);
    } else if (typeof onPage.description === 'string') {
      const d = onPage.description.trim();
      if (d.length < 50) push('short_meta', 'low', 'Meta description very short', '', url, 30);
      if (d.length > 165) push('long_meta', 'low', 'Meta description likely truncated', '', url, 30);
    }
    const h1Count = Array.isArray(onPage.h1) ? onPage.h1.length : 0;
    if (h1Count === 0) push('missing_h1', 'high', 'Missing H1', 'Every indexable page should have a single H1.', url, 70);
    else if (h1Count > 1) push('multiple_h1', 'medium', 'Multiple H1 tags', 'Choose one H1 per page.', url, 50);

    if (checks.no_image_alt === true || meta.images_without_alt === true) {
      push('missing_alt', 'medium', 'Images missing alt text', 'Accessibility + image search impact.', url, 40);
    }
    if (checks.no_h1_tag === true) {
      push('missing_h1', 'high', 'Missing H1', 'Every indexable page should have a single H1.', url, 70);
    }
    if (checks.duplicate_title === true) {
      push('duplicate_title', 'high', 'Duplicate title tag', 'Same title on multiple pages causes cannibalization.', url, 70);
    }
    if (checks.duplicate_description === true) {
      push('duplicate_meta', 'medium', 'Duplicate meta description', 'Unique meta descriptions improve CTR.', url, 40);
    }
    if (checks.canonical === false) {
      push('missing_canonical', 'medium', 'Missing canonical', 'Helps consolidate signals across duplicates.', url, 50);
    }
    if (checks.https_to_http_links === true) {
      push('mixed_content', 'high', 'Mixed content (HTTP links on HTTPS)', 'Browsers warn or block these.', url, 60);
    }
    if (typeof onPage.plain_text_word_count === 'number' && onPage.plain_text_word_count < 300) {
      push('thin_content', 'medium', 'Thin content (<300 words)', 'Likely insufficient depth for ranking.', url, 50);
    }
    if (Array.isArray(onPage.schema) && onPage.schema.length === 0) {
      push('no_schema', 'low', 'No structured data detected', 'Schema helps eligibility for rich results and AI surfaces.', url, 30);
    }
  }

  const projectUrlSet = new Set(projectUrls || []);
  for (const g of groups.values()) {
    // Trim affected URLs to ones we actually own / care about (keeps payload small).
    const filtered = g.urls.filter((u) => !projectUrlSet.size || projectUrlSet.has(u));
    if (!filtered.length) continue;
    findings.push({
      category: 'technical',
      type: g.type,
      severity: g.severity,
      impact: g.impact,
      title: g.title,
      description: g.description,
      affectedUrls: filtered.slice(0, 50),
    });
  }
  return findings;
}

function findingsFromUrlInspections(inspections) {
  // inspections: { url, result } where result is the GSC inspectionResult.
  const findings = [];
  const blockedByRobots = [];
  const notIndexed = [];
  const canonicalMismatch = [];
  for (const { url, result } of inspections) {
    if (!result || !result.indexStatusResult) continue;
    const r = result.indexStatusResult;
    if (r.robotsTxtState === 'DISALLOWED') blockedByRobots.push(url);
    if (r.verdict && r.verdict !== 'PASS' && r.verdict !== 'PARTIAL') notIndexed.push(url);
    if (r.googleCanonical && r.userCanonical && r.googleCanonical !== r.userCanonical) {
      canonicalMismatch.push(url);
    }
  }
  if (blockedByRobots.length) {
    findings.push({
      category: 'technical',
      type: 'robots_blocked',
      severity: 'high',
      impact: 80,
      title: 'Pages blocked by robots.txt',
      description: 'Google reports these URLs as disallowed.',
      affectedUrls: blockedByRobots.slice(0, 50),
    });
  }
  if (notIndexed.length) {
    findings.push({
      category: 'technical',
      type: 'not_indexed',
      severity: 'high',
      impact: 80,
      title: 'Pages not indexed',
      description: 'Inspection verdict is not PASS.',
      affectedUrls: notIndexed.slice(0, 50),
    });
  }
  if (canonicalMismatch.length) {
    findings.push({
      category: 'technical',
      type: 'canonical_mismatch',
      severity: 'medium',
      impact: 50,
      title: 'Canonical mismatch (Google chose a different URL)',
      description: 'User-declared canonical differs from Google-selected canonical.',
      affectedUrls: canonicalMismatch.slice(0, 50),
    });
  }
  return findings;
}

async function runOnPageCrawl({ siteUrl, maxCrawlPages, creds }) {
  // Strip scheme prefix to a bare domain — DataForSEO On-Page wants the
  // target as a domain, optionally with subdir, e.g. `example.com/blog`.
  const target = String(siteUrl)
    .replace(/^sc-domain:/i, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const taskId = await dataforseo.postOnPageTask({ target, maxCrawlPages }, creds);
  // Poll up to ~5 minutes. The crawl runs asynchronously; we'll loop here.
  const start = Date.now();
  const POLL_MS = 8000;
  const MAX_MS = 5 * 60 * 1000;
  while (Date.now() - start < MAX_MS) {
    // eslint-disable-next-line no-await-in-loop
    const ready = await dataforseo.isOnPageTaskReady(taskId, creds);
    if (ready) break;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  const [summary, pages, links] = await Promise.all([
    dataforseo.fetchOnPageSummary(taskId, creds).catch(() => null),
    dataforseo.fetchOnPagePages(taskId, creds, { limit: Math.min(maxCrawlPages, 1000) }).catch(() => []),
    dataforseo.fetchOnPageLinks(taskId, creds, { limit: 1000 }).catch(() => []),
  ]);
  return { taskId, summary, pages, links };
}

module.exports = {
  findingsFromOnPagePages,
  findingsFromUrlInspections,
  runOnPageCrawl,
};
