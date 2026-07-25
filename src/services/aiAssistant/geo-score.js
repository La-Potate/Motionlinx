'use strict';

const aiSeo = require('../aiSeo');
const { fetchWithSmartAgent } = require('../../utils/smartFetch');

// GEO / AI-readiness signals. Each input here returns a 0..1 sub-score; the
// composite happens in scoring.js. The signals deliberately mirror what an
// LLM actually consumes when crawling — robots access, structural markup,
// freshness, factual specificity, schema, llms.txt.

const KEY_AI_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'OAI-SearchBot', 'anthropic-ai'];

// 1. AI-crawler accessibility from robots.txt.
async function scoreCrawlerAccess(hostname) {
  try {
    const robotsResp = await aiSeo.fetchRobotsTxt(hostname);
    const groups = aiSeo.parseRobotsTxt(robotsResp.body || '');
    const verdicts = KEY_AI_BOTS.map((bot) => aiSeo.evaluateAgentAccess(groups, [bot], { path: '/', missingRobots: false }));
    const allowed = verdicts.filter((v) => v.allowed).length;
    return { score: allowed / KEY_AI_BOTS.length, verdicts };
  } catch {
    return { score: 1, verdicts: [], note: 'robots.txt missing; default allow.' };
  }
}

// 2. llms.txt presence.
async function scoreLlmsTxt(hostname) {
  try {
    const res = await fetchWithSmartAgent(`https://${hostname}/llms.txt`, { timeout: 8000, allowInsecureRetry: true });
    if (res.ok) return 1;
  } catch {
    /* miss */
  }
  return 0;
}

// 3. Structural clarity: per sampled page, score the H1/H2/H3 depth +
//    list-density + question-headings density. Median across the sample.
function scoreClarityFromOnPagePages(pages) {
  if (!Array.isArray(pages) || !pages.length) return null;
  const subScores = [];
  for (const p of pages) {
    const onPage = p.on_page || p.meta || {};
    const h1 = Array.isArray(onPage.h1) ? onPage.h1.length : 0;
    const h2 = Array.isArray(onPage.h2) ? onPage.h2.length : 0;
    const h3 = Array.isArray(onPage.h3) ? onPage.h3.length : 0;
    const lists = onPage.lists_count || onPage.lists || 0;
    const words = onPage.plain_text_word_count || 0;
    if (!words) continue;
    let s = 0;
    if (h1 === 1) s += 0.3;
    if (h2 >= 2) s += 0.3;
    if (h3 >= 1) s += 0.1;
    if (lists >= 1) s += 0.2;
    // Question-style H2s (proxy: a heading containing '?' would be ideal,
    // but the on-page API rarely exposes heading text; we use list density
    // as a proxy for "structured" content here).
    if (lists / Math.max(1, h2) >= 1) s += 0.1;
    subScores.push(Math.min(1, s));
  }
  if (!subScores.length) return null;
  return subScores.reduce((a, b) => a + b, 0) / subScores.length;
}

// 4. Schema quality: ratio of sampled pages with at least one schema block.
function scoreSchemaQuality(pages) {
  if (!Array.isArray(pages) || !pages.length) return null;
  let hits = 0;
  let total = 0;
  for (const p of pages) {
    const schema = p.on_page?.schema || p.meta?.schema || [];
    total += 1;
    if (Array.isArray(schema) && schema.length) hits += 1;
  }
  return total ? hits / total : null;
}

// 5. Freshness: ratio of sampled pages updated within the last 365 days.
function scoreFreshness(pages) {
  if (!Array.isArray(pages) || !pages.length) return null;
  const now = Date.now();
  let total = 0;
  let fresh = 0;
  for (const p of pages) {
    const ts = p.last_modified_date || p.meta?.last_modified_date || p.on_page?.date || null;
    if (!ts) continue;
    total += 1;
    const date = new Date(ts).getTime();
    if (!Number.isFinite(date)) continue;
    if (now - date < 365 * 24 * 60 * 60 * 1000) fresh += 1;
  }
  return total ? fresh / total : null;
}

// 6. Factual specificity: numeric / date density (proxy for citable claims).
function scoreSpecificity(pages) {
  if (!Array.isArray(pages) || !pages.length) return null;
  const subScores = [];
  for (const p of pages) {
    const onPage = p.on_page || p.meta || {};
    const text = onPage.plain_text_word_count || 0;
    if (!text) continue;
    const numbers = onPage.numbers_count || 0; // some shapes expose this, fall back to 0
    const density = numbers / Math.max(50, text); // numbers per token
    subScores.push(Math.min(1, density * 200)); // 200 numbers in 10k words = 1.0
  }
  if (!subScores.length) return null;
  return subScores.reduce((a, b) => a + b, 0) / subScores.length;
}

async function computeGeoSignals({ hostname, pages }) {
  const [crawler, llms] = await Promise.all([scoreCrawlerAccess(hostname), scoreLlmsTxt(hostname)]);
  return {
    crawlerAccess: crawler.score,
    crawlerVerdicts: crawler.verdicts,
    llmsTxt: llms,
    clarity: scoreClarityFromOnPagePages(pages),
    schemaQuality: scoreSchemaQuality(pages),
    freshness: scoreFreshness(pages),
    specificity: scoreSpecificity(pages),
  };
}

function findingsFromGeoSignals(signals) {
  const findings = [];
  if (signals.crawlerAccess < 1) {
    const blocked = signals.crawlerVerdicts.filter((v) => !v.allowed).map((v) => v.matchedAlias);
    findings.push({
      category: 'geo',
      type: 'ai_crawler_blocked',
      severity: 'high',
      impact: 80,
      title: `Blocking ${blocked.length} AI crawler${blocked.length === 1 ? '' : 's'}`,
      description: `robots.txt disallows: ${blocked.join(', ')}. Allowing these surfaces eligibility for ChatGPT, Claude, Perplexity citations.`,
      affectedUrls: [],
    });
  }
  if (signals.llmsTxt === 0) {
    findings.push({
      category: 'geo',
      type: 'no_llms_txt',
      severity: 'low',
      impact: 30,
      title: 'No llms.txt published',
      description: 'llms.txt tells LLMs what to prioritise. Generate one with the LLMS Validator tool.',
      affectedUrls: [],
    });
  }
  if (typeof signals.schemaQuality === 'number' && signals.schemaQuality < 0.5) {
    findings.push({
      category: 'geo',
      type: 'low_schema_coverage',
      severity: 'medium',
      impact: 55,
      title: `Schema markup on only ${Math.round((signals.schemaQuality || 0) * 100)}% of sampled pages`,
      description: 'Schema is a strong signal to both Google rich results and AI surfaces.',
      affectedUrls: [],
    });
  }
  if (typeof signals.freshness === 'number' && signals.freshness < 0.3) {
    findings.push({
      category: 'geo',
      type: 'stale_content',
      severity: 'medium',
      impact: 45,
      title: 'Most sampled pages not updated in over a year',
      description: 'Freshness is increasingly important for AI surfaces; refresh dated content.',
      affectedUrls: [],
    });
  }
  return findings;
}

module.exports = { computeGeoSignals, findingsFromGeoSignals };
