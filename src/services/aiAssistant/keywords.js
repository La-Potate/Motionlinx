'use strict';

const crypto = require('crypto');
const dataforseo = require('../../integrations/dataforseo');
const { dbGet, dbRun } = require('../../utils/dbAsync');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
function hashQuery(payload) {
  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

async function cached(projectId, source, payload, fetcher) {
  const key = hashQuery(payload);
  const row = await dbGet(
    `SELECT result_json, fetched_at FROM keyword_research_cache
     WHERE project_id = ? AND source = ? AND query_hash = ?`,
    [projectId, source, key],
  );
  if (row) {
    const age = Date.now() - new Date(row.fetched_at).getTime();
    if (age < CACHE_TTL_MS) return JSON.parse(row.result_json || 'null');
  }
  const fresh = await fetcher();
  await dbRun(
    `INSERT INTO keyword_research_cache (project_id, source, query_hash, result_json, fetched_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(project_id, source, query_hash)
     DO UPDATE SET result_json = excluded.result_json, fetched_at = CURRENT_TIMESTAMP`,
    [projectId, source, key, JSON.stringify(fresh)],
  );
  return fresh;
}

// `domainTarget` here is a bare domain (no scheme), e.g. "example.com".
async function pullKeywordResearch({ projectId, domainTarget, locationCode, languageCode, seedKeywords, creds }) {
  const ranked = await cached(projectId, 'labs_ranked', { target: domainTarget, locationCode, languageCode }, () =>
    dataforseo.fetchLabsRankedKeywords({ target: domainTarget, location_code: locationCode, language_code: languageCode, limit: 200 }, creds).catch(() => []),
  );
  const competitors = await cached(projectId, 'labs_competitors', { target: domainTarget, locationCode, languageCode }, () =>
    dataforseo.fetchLabsCompetitorsDomain({ target: domainTarget, location_code: locationCode, language_code: languageCode, limit: 10 }, creds).catch(() => []),
  );

  let ideas = [];
  if (seedKeywords && seedKeywords.length) {
    ideas = await cached(projectId, 'labs_ideas', { keywords: seedKeywords.slice(0, 5), locationCode, languageCode }, () =>
      dataforseo.fetchLabsKeywordIdeas({ keywords: seedKeywords.slice(0, 5), location_code: locationCode, language_code: languageCode, limit: 200 }, creds).catch(() => []),
    );
  }

  // Content-gap against the top competitor.
  let gap = [];
  const topCompetitor = competitors.find((c) => c.domain && c.domain !== domainTarget);
  if (topCompetitor && topCompetitor.domain) {
    gap = await cached(projectId, 'labs_gap', { target1: domainTarget, target2: topCompetitor.domain, locationCode, languageCode }, () =>
      dataforseo.fetchLabsDomainIntersection({ target1: topCompetitor.domain, target2: domainTarget, intersection_mode: 'difference', location_code: locationCode, language_code: languageCode, limit: 100 }, creds).catch(() => []),
    );
  }

  // AI Keyword Data for GEO keywords — same volume API, AI-specific.
  let aiKeywords = [];
  if (seedKeywords && seedKeywords.length) {
    const aiResp = await cached(projectId, 'ai_keyword', { keywords: seedKeywords.slice(0, 10), locationCode, languageCode }, () =>
      dataforseo.fetchDataForSeoAiKeywordData({ keywords: seedKeywords.slice(0, 10), location_code: locationCode, language_code: languageCode }, creds).then((r) => r.items || []).catch(() => []),
    );
    aiKeywords = aiResp;
  }

  return { ranked, competitors, ideas, gap, aiKeywords, topCompetitor: topCompetitor?.domain || null };
}

function findingsFromKeywordResearch({ gap, ranked }) {
  const findings = [];
  if (Array.isArray(gap) && gap.length) {
    findings.push({
      category: 'content',
      type: 'content_gap',
      severity: 'medium',
      impact: 60,
      title: `${gap.length} content gaps vs top competitor`,
      description: 'Keywords the top competitor ranks for that this site does not. Treat the high-volume entries as content briefs.',
      affectedUrls: [],
      meta: { sample: gap.slice(0, 20).map((g) => ({ keyword: g.keyword_data?.keyword || g.keyword, volume: g.keyword_data?.keyword_info?.search_volume || g.keyword_info?.search_volume || 0 })) },
    });
  }
  if (Array.isArray(ranked) && ranked.length) {
    const top10 = ranked.filter((r) => (r.ranked_serp_element?.serp_item?.rank_absolute || 999) <= 10).length;
    if (top10 < 5) {
      findings.push({
        category: 'opportunity',
        type: 'low_top_rankings',
        severity: 'medium',
        impact: 50,
        title: `Only ${top10} keywords in the Google top 10`,
        description: 'Authority is concentrated in the long tail. Building out hub/cluster pages on your strongest topics is the highest-leverage move.',
        affectedUrls: [],
      });
    }
  }
  return findings;
}

module.exports = { pullKeywordResearch, findingsFromKeywordResearch };
