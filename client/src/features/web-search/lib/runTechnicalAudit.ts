import authenticatedFetch from '@/shared/api/httpClient';
import spiderService from '@/shared/api/spider';

/**
 * Technical audit, composed from endpoints that already work and need no API
 * key: sitemap/crawl discovery, bulk HTTP status, and bulk metadata.
 *
 * This replaces a page that rendered hardcoded MOCK_PROJECTS / MOCK_OVERVIEW /
 * MOCK_GROUPS — it reported invented issues for a site that was never fetched.
 * Every finding below is derived from a real response.
 */

/** Server-side caps. Requests are chunked to stay inside them. */
const HTTP_BATCH = 50; // src/services/webSearch.js MAX_BULK_HTTP_URLS
const META_BATCH = 200; // src/routes/web-search.js site-tree/meta LIMIT

export type Severity = 'critical' | 'warning' | 'notice';

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  /** Why it matters, in plain terms. */
  detail: string;
  urls: string[];
};

export type PageRow = {
  url: string;
  status: number | string | null;
  redirected: boolean;
  hops: number;
  finalUrl: string;
  title: string;
  description: string;
  timeMs: number | null;
};

export type AuditResult = {
  origin: string;
  discovered: number;
  audited: number;
  source: 'sitemap' | 'crawl';
  pages: PageRow[];
  findings: Finding[];
  score: number;
};

export type Progress = { step: string; done: number; total: number };

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

async function postJson(path: string, body: unknown) {
  const res = await authenticatedFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

/** Discover URLs from the sitemap, falling back to a crawl. */
async function discover(target: string): Promise<{ urls: string[]; source: 'sitemap' | 'crawl' }> {
  try {
    const data = await postJson('/api/web-search/site-tree/sitemap', { target });
    const urls: string[] = data?.urls || [];
    if (urls.length) return { urls, source: 'sitemap' };
  } catch {
    // No sitemap is normal; fall through to crawling.
  }
  const crawl: any = await spiderService.crawl(target, { crawlLimit: 200 });
  const urls = (crawl?.nodes || [])
    .map((n: any) => n?.url)
    .filter((u: any): u is string => typeof u === 'string' && !!u);
  return { urls, source: 'crawl' };
}

export async function runTechnicalAudit(
  target: string,
  limit: number,
  onProgress: (p: Progress) => void
): Promise<AuditResult> {
  onProgress({ step: 'Finding pages', done: 0, total: 1 });
  const { urls: discovered, source } = await discover(target);
  if (!discovered.length) {
    throw new Error('No pages found. Check the domain, or that the site is reachable.');
  }

  const urls = discovered.slice(0, limit);

  // --- HTTP status + redirect chains ---
  const httpByUrl = new Map<string, any>();
  const httpBatches = chunk(urls, HTTP_BATCH);
  for (let i = 0; i < httpBatches.length; i += 1) {
    onProgress({ step: 'Checking responses', done: i, total: httpBatches.length });
    // eslint-disable-next-line no-await-in-loop
    const data = await postJson('/api/web-search/bulk-http', { urls: httpBatches[i] });
    (data?.results || []).forEach((r: any) => httpByUrl.set(r.url, r));
  }

  // --- titles and descriptions ---
  const metaByUrl = new Map<string, any>();
  const metaBatches = chunk(urls, META_BATCH);
  for (let i = 0; i < metaBatches.length; i += 1) {
    onProgress({ step: 'Reading page metadata', done: i, total: metaBatches.length });
    // eslint-disable-next-line no-await-in-loop
    const data = await postJson('/api/web-search/site-tree/meta', { urls: metaBatches[i] });
    (data?.results || []).forEach((r: any) => metaByUrl.set(r.url, r));
  }

  const pages: PageRow[] = urls.map((url) => {
    const h = httpByUrl.get(url) || {};
    const m = metaByUrl.get(url) || {};
    return {
      url,
      status: h.finalStatus ?? null,
      redirected: Boolean(h.redirected),
      hops: Array.isArray(h.chain) ? h.chain.length : 0,
      finalUrl: h.finalUrl || '',
      title: (m.title || '').trim(),
      description: (m.description || '').trim(),
      timeMs: typeof h.timeMs === 'number' ? h.timeMs : null,
    };
  });

  // ---- findings, all derived from the responses above ----
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, 'urls'> & { urls: string[] }) => {
    if (f.urls.length) findings.push(f);
  };
  const numeric = (s: PageRow['status']) => (typeof s === 'number' ? s : NaN);

  add({
    id: 'broken',
    severity: 'critical',
    title: 'Pages returning an error',
    detail: 'These return 4xx or 5xx. Visitors and crawlers both hit a dead end.',
    urls: pages.filter((p) => numeric(p.status) >= 400).map((p) => p.url),
  });
  add({
    id: 'unreachable',
    severity: 'critical',
    title: 'Pages that did not respond',
    detail: 'No usable HTTP response — DNS failure, timeout, or a refused connection.',
    urls: pages.filter((p) => p.status === null || typeof p.status === 'string').map((p) => p.url),
  });
  add({
    id: 'missing-title',
    severity: 'critical',
    title: 'Missing title',
    detail: 'Search results fall back to guessing a heading when there is no title element.',
    urls: pages.filter((p) => numeric(p.status) < 400 && !p.title).map((p) => p.url),
  });

  add({
    id: 'chains',
    severity: 'warning',
    title: 'Redirect chains',
    detail: 'More than one hop before the final page. Each hop costs crawl budget and time.',
    urls: pages.filter((p) => p.hops > 1).map((p) => p.url),
  });
  add({
    id: 'missing-desc',
    severity: 'warning',
    title: 'Missing meta description',
    detail: 'Without one, the snippet in search results is assembled from page text.',
    urls: pages.filter((p) => numeric(p.status) < 400 && !p.description).map((p) => p.url),
  });

  const dupes = (pick: (p: PageRow) => string) => {
    const seen = new Map<string, string[]>();
    pages
      .filter((p) => pick(p))
      .forEach((p) => {
        const k = pick(p).toLowerCase();
        seen.set(k, [...(seen.get(k) || []), p.url]);
      });
    return [...seen.values()].filter((g) => g.length > 1).flat();
  };
  add({
    id: 'dupe-title',
    severity: 'warning',
    title: 'Duplicate titles',
    detail: 'Several pages share one title, so they are hard to tell apart in results.',
    urls: dupes((p) => p.title),
  });
  add({
    id: 'dupe-desc',
    severity: 'warning',
    title: 'Duplicate meta descriptions',
    detail: 'The same snippet is reused across pages.',
    urls: dupes((p) => p.description),
  });

  add({
    id: 'redirects',
    severity: 'notice',
    title: 'Single redirects',
    detail: 'One hop to the destination. Fine to keep, worth linking directly where you can.',
    urls: pages.filter((p) => p.redirected && p.hops <= 1).map((p) => p.url),
  });
  add({
    id: 'long-title',
    severity: 'notice',
    title: 'Long titles',
    detail: 'Over 60 characters, so results are likely to truncate them.',
    urls: pages.filter((p) => p.title.length > 60).map((p) => p.url),
  });
  add({
    id: 'long-desc',
    severity: 'notice',
    title: 'Long meta descriptions',
    detail: 'Over 160 characters and likely to be cut short.',
    urls: pages.filter((p) => p.description.length > 160).map((p) => p.url),
  });
  add({
    id: 'slow',
    severity: 'notice',
    title: 'Slow responses',
    detail: 'Took over 2 seconds to respond during this check.',
    urls: pages.filter((p) => (p.timeMs ?? 0) > 2000).map((p) => p.url),
  });

  // Score: start at 100, weight by severity, floor at 0. Deliberately simple —
  // it ranks runs against each other rather than claiming an absolute grade.
  const weight: Record<Severity, number> = { critical: 3, warning: 1.5, notice: 0.4 };
  const penalty = findings.reduce((sum, f) => sum + f.urls.length * weight[f.severity], 0);
  const score = Math.max(0, Math.round(100 - (penalty / Math.max(pages.length, 1)) * 10));

  return {
    origin: target,
    discovered: discovered.length,
    audited: pages.length,
    source,
    pages,
    findings,
    score,
  };
}
