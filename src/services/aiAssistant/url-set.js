'use strict';

const { normalizeUrl } = require('../../utils/url');

// Build the canonical URL set for an analysis run from three sources:
//   1. sitemap URLs (from gsc_sitemaps_cache or live sitemap parse)
//   2. GSC top pages (top-impressions over the last 28 days)
//   3. crawl-discovered URLs (DataForSEO on_page/pages result)
//
// Returns: { urls: string[], sources: Record<url, string[]> }
// Cap at `limit` to keep URL Inspection + Lighthouse calls bounded.

function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    // GSC and DataForSEO both treat trailing-slash-on-root specially; keep
    // it for the root path, strip on others.
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    return null;
  }
}

function buildUrlSet({ sitemapUrls = [], gscPages = [], crawlUrls = [], limit = 200 }) {
  const sources = new Map();
  const add = (url, source) => {
    const n = normalize(url);
    if (!n) return;
    const existing = sources.get(n) || [];
    if (!existing.includes(source)) existing.push(source);
    sources.set(n, existing);
  };

  for (const u of sitemapUrls) add(u, 'sitemap');
  for (const u of gscPages) add(u, 'gsc');
  for (const u of crawlUrls) add(u, 'crawl');

  // Prefer URLs that appear in more than one source, then by sitemap, then
  // by GSC presence, then by crawl order. This ensures the cap doesn't drop
  // the most-canonical URLs first.
  const ranked = Array.from(sources.entries())
    .map(([url, srcs]) => ({ url, srcs }))
    .sort((a, b) => {
      const ma = a.srcs.length;
      const mb = b.srcs.length;
      if (mb !== ma) return mb - ma;
      const aHasSitemap = a.srcs.includes('sitemap') ? 1 : 0;
      const bHasSitemap = b.srcs.includes('sitemap') ? 1 : 0;
      if (bHasSitemap !== aHasSitemap) return bHasSitemap - aHasSitemap;
      const aHasGsc = a.srcs.includes('gsc') ? 1 : 0;
      const bHasGsc = b.srcs.includes('gsc') ? 1 : 0;
      return bHasGsc - aHasGsc;
    });

  const urls = ranked.slice(0, limit).map((r) => r.url);
  const sourceMap = Object.fromEntries(urls.map((u) => [u, sources.get(u)]));
  return { urls, sources: sourceMap, droppedCount: Math.max(0, ranked.length - urls.length) };
}

module.exports = { buildUrlSet, normalize };
