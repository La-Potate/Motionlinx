'use strict';

// Scoring formulas — kept deterministic and explainable so the UI can
// surface the breakdown alongside the headline number.
//
// All scores are 0–100. Sub-factors carry weights that sum to 1.0 inside
// their category. Each sub-factor contributes `weight * subScore` to the
// category total.
//
//   Technical health (0–100) = weighted sum of:
//     0.30  indexability ratio (indexed / inspectable)
//     0.20  on-page issue ratio inverted (1 - issues/total)
//     0.20  Lighthouse Performance (median across audited URLs)
//     0.10  Lighthouse SEO
//     0.10  Lighthouse Accessibility
//     0.10  HTTPS + status-code health (no 4xx/5xx on sampled URLs)
//
//   Content health (0–100) = weighted sum of:
//     0.30  title/meta presence + length sanity
//     0.30  unique H1 + heading hierarchy
//     0.20  word-count adequacy (>= 300 baseline, normalised to 1500)
//     0.20  schema presence on key URLs
//
//   GEO / AI-readiness (0–100) = weighted sum of:
//     0.30  AI-crawler accessibility (robots.txt allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended)
//     0.15  llms.txt present
//     0.20  structural clarity (heading depth + list density on sampled pages)
//     0.15  schema markup quality
//     0.10  content freshness
//     0.10  factual specificity (numeric/date density)
//
//   Overall = 0.40*technical + 0.30*content + 0.30*geo
//
// All inputs MUST be in [0, 1]. Caller is responsible for clamping. If an
// input is unavailable (e.g. no Lighthouse data because the URL set was
// empty), we pass `null` and the weight gets redistributed across the
// available sub-factors so partial data still yields a meaningful score.

function clamp01(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function weightedScore(parts) {
  // parts: [{ weight, value }] where value may be null (skipped).
  const present = parts.filter((p) => p.value !== null && p.value !== undefined);
  if (!present.length) return { score: 0, breakdown: parts };
  const totalWeight = present.reduce((sum, p) => sum + p.weight, 0);
  const score = present.reduce((sum, p) => sum + p.value * (p.weight / totalWeight), 0);
  return { score: Math.round(score * 100), breakdown: parts };
}

function median(values) {
  const arr = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function computeTechnical({ indexability, onPage, lighthouse, statusHealth }) {
  return weightedScore([
    { key: 'indexability', label: 'Indexability', weight: 0.30, value: clamp01(indexability) },
    { key: 'onPage', label: 'On-page issues', weight: 0.20, value: clamp01(onPage) },
    { key: 'perf', label: 'Performance (Lighthouse)', weight: 0.20, value: clamp01(lighthouse?.performance) },
    { key: 'seoLh', label: 'SEO (Lighthouse)', weight: 0.10, value: clamp01(lighthouse?.seo) },
    { key: 'a11y', label: 'Accessibility (Lighthouse)', weight: 0.10, value: clamp01(lighthouse?.accessibility) },
    { key: 'http', label: 'HTTP health', weight: 0.10, value: clamp01(statusHealth) },
  ]);
}

function computeContent({ titlesMeta, headings, wordCount, schema }) {
  return weightedScore([
    { key: 'titlesMeta', label: 'Titles + meta', weight: 0.30, value: clamp01(titlesMeta) },
    { key: 'headings', label: 'Heading hierarchy', weight: 0.30, value: clamp01(headings) },
    { key: 'wordCount', label: 'Word-count adequacy', weight: 0.20, value: clamp01(wordCount) },
    { key: 'schema', label: 'Schema presence', weight: 0.20, value: clamp01(schema) },
  ]);
}

function computeGeo({ crawlerAccess, llmsTxt, clarity, schemaQuality, freshness, specificity }) {
  return weightedScore([
    { key: 'crawlerAccess', label: 'AI crawler access', weight: 0.30, value: clamp01(crawlerAccess) },
    { key: 'llmsTxt', label: 'llms.txt present', weight: 0.15, value: clamp01(llmsTxt) },
    { key: 'clarity', label: 'Structural clarity', weight: 0.20, value: clamp01(clarity) },
    { key: 'schemaQuality', label: 'Schema quality', weight: 0.15, value: clamp01(schemaQuality) },
    { key: 'freshness', label: 'Freshness', weight: 0.10, value: clamp01(freshness) },
    { key: 'specificity', label: 'Factual specificity', weight: 0.10, value: clamp01(specificity) },
  ]);
}

function computeOverall({ technical, content, geo }) {
  const present = [];
  if (typeof technical === 'number') present.push({ key: 'technical', weight: 0.40, value: technical });
  if (typeof content === 'number') present.push({ key: 'content', weight: 0.30, value: content });
  if (typeof geo === 'number') present.push({ key: 'geo', weight: 0.30, value: geo });
  if (!present.length) return 0;
  const totalWeight = present.reduce((s, p) => s + p.weight, 0);
  const score = present.reduce((s, p) => s + p.value * (p.weight / totalWeight), 0);
  return Math.round(score);
}

module.exports = {
  median,
  weightedScore,
  computeTechnical,
  computeContent,
  computeGeo,
  computeOverall,
};
