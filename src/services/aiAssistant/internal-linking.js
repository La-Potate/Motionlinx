'use strict';

const { dbRun } = require('../../utils/dbAsync');

// Build an internal-link graph from the on-page crawl `links` payload and
// surface concrete suggestions: orphan pages and "high-opportunity targets
// with no inbound links".
//
// `links` row shape (DataForSEO on_page/links): { domain_from, page_from,
// domain_to, page_to, link_from, link_to, text, type, ... }

function isInternalLink(link) {
  if (!link) return false;
  const from = link.domain_from || '';
  const to = link.domain_to || '';
  return Boolean(from && to && from === to);
}

async function persist({ projectId, links }) {
  await dbRun(`DELETE FROM internal_link_edges WHERE project_id = ?`, [projectId]);
  for (const l of links) {
    if (!isInternalLink(l)) continue;
    const from = l.link_from || l.page_from;
    const to = l.link_to || l.page_to;
    if (!from || !to) continue;
    // eslint-disable-next-line no-await-in-loop
    await dbRun(
      `INSERT INTO internal_link_edges (project_id, from_url, to_url, anchor_text) VALUES (?, ?, ?, ?)`,
      [projectId, from, to, (l.text || '').slice(0, 200)],
    );
  }
}

function buildGraph(links, urls) {
  const inbound = new Map();
  const outbound = new Map();
  for (const u of urls || []) {
    inbound.set(u, []);
    outbound.set(u, []);
  }
  for (const l of links) {
    if (!isInternalLink(l)) continue;
    const from = l.link_from || l.page_from;
    const to = l.link_to || l.page_to;
    if (!from || !to) continue;
    if (!inbound.has(to)) inbound.set(to, []);
    if (!outbound.has(from)) outbound.set(from, []);
    inbound.get(to).push({ from, anchor: l.text || '' });
    outbound.get(from).push({ to, anchor: l.text || '' });
  }
  return { inbound, outbound };
}

function findOrphans(inbound, urls) {
  return urls.filter((u) => !(inbound.get(u) || []).length);
}

// Suggest from→to links for pages whose target ranks just-outside-top-10 in
// GSC but has zero internal links. Picks the most authoritative donor pages
// (highest outbound count, proxy for "hub").
function buildSuggestions({ inbound, outbound, opportunityUrls, urls }) {
  const suggestions = [];
  const outboundCount = new Map([...outbound.entries()].map(([u, list]) => [u, list.length]));
  const hubs = [...urls]
    .map((u) => [u, outboundCount.get(u) || 0])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([u]) => u);
  for (const target of opportunityUrls) {
    if (!urls.includes(target)) continue;
    const inboundLinks = inbound.get(target) || [];
    if (inboundLinks.length >= 3) continue; // already linked enough
    const donor = hubs.find((h) => h !== target && !inboundLinks.some((l) => l.from === h));
    if (!donor) continue;
    suggestions.push({
      from: donor,
      to: target,
      anchor: deriveAnchorText(target),
      reason: 'Striking-distance target with weak internal linking',
    });
  }
  return suggestions.slice(0, 25);
}

function deriveAnchorText(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop() || '';
    return path.replace(/[-_]/g, ' ').slice(0, 64);
  } catch {
    return '';
  }
}

function findingsFromGraph({ orphans, suggestions }) {
  const findings = [];
  if (orphans.length) {
    findings.push({
      category: 'internal-linking',
      type: 'orphan_pages',
      severity: 'medium',
      impact: 55,
      title: `${orphans.length} orphan page${orphans.length === 1 ? '' : 's'}`,
      description: 'These URLs have no inbound internal links — crawlers can only reach them via sitemap.',
      affectedUrls: orphans.slice(0, 25),
    });
  }
  if (suggestions.length) {
    findings.push({
      category: 'internal-linking',
      type: 'link_suggestions',
      severity: 'low',
      impact: 45,
      title: `${suggestions.length} internal-link suggestions`,
      description: 'Link these high-opportunity targets from your strongest hubs.',
      affectedUrls: suggestions.map((s) => s.to).slice(0, 25),
      meta: { suggestions: suggestions.slice(0, 25) },
    });
  }
  return findings;
}

module.exports = {
  isInternalLink,
  persist,
  buildGraph,
  findOrphans,
  buildSuggestions,
  findingsFromGraph,
};
