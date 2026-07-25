'use strict';

const { normalizeUrl } = require('../utils/url');
const { fetchWithSmartAgent } = require('../utils/smartFetch');

const ROBOTS_CHECKER_USER_AGENT =
  'SEOToolkitCrawlerAccessChecker/1.0 (+https://seo-toolkit.local)';

const AI_CRAWLER_AGENTS = [
  { id: 'amazonbot', label: 'Amazonbot', userAgents: ['amazonbot'] },
  { id: 'applebot-extended', label: 'Applebot-Extended', userAgents: ['applebot-extended'] },
  { id: 'bytespider', label: 'Bytespider', userAgents: ['bytespider'] },
  { id: 'ccbot', label: 'CCBot', userAgents: ['ccbot'] },
  { id: 'chatgpt-user', label: 'ChatGPT-User', userAgents: ['chatgpt-user'] },
  { id: 'claudebot', label: 'ClaudeBot', userAgents: ['claudebot'] },
  { id: 'claude-web', label: 'Claude-Web', userAgents: ['claude-web'] },
  { id: 'cohere-ai', label: 'cohere-ai', userAgents: ['cohere-ai'] },
  { id: 'facebookexternalhit', label: 'FacebookExternalHit', userAgents: ['facebookexternalhit'] },
  {
    id: 'google-cloudvertexbot',
    label: 'Google-CloudVertexBot',
    userAgents: ['google-cloudvertexbot'],
  },
  { id: 'google-extended', label: 'Google-Extended', userAgents: ['google-extended'] },
  { id: 'gptbot', label: 'GPTBot', userAgents: ['gptbot'] },
  { id: 'magpie-crawler', label: 'magpie-crawler', userAgents: ['magpie-crawler'] },
  { id: 'meta-externalagent', label: 'meta-externalagent', userAgents: ['meta-externalagent'] },
  { id: 'oai-searchbot', label: 'OAI-SearchBot', userAgents: ['oai-searchbot'] },
  { id: 'openai', label: 'OpenAI', userAgents: ['openai'] },
  { id: 'omgili', label: 'omgili', userAgents: ['omgili'] },
  { id: 'omgilibot', label: 'omgilibot', userAgents: ['omgilibot', 'omgilbot'] },
  { id: 'perplexitybot', label: 'PerplexityBot', userAgents: ['perplexitybot'] },
  { id: 'perplexity-user', label: 'Perplexity-User', userAgents: ['perplexity-user'] },
  { id: 'petalbot', label: 'PetalBot', userAgents: ['petalbot'] },
  { id: 'scrapy', label: 'Scrapy', userAgents: ['scrapy'] },
  { id: 'twitterbot', label: 'Twitterbot', userAgents: ['twitterbot'] },
  { id: 'turnitinbot', label: 'TurnitinBot', userAgents: ['turnitinbot'] },
  { id: 'yandexadditional', label: 'YandexAdditional', userAgents: ['yandexadditional'] },
  {
    id: 'yandexadditionalbot',
    label: 'YandexAdditionalBot',
    userAgents: ['yandexadditionalbot'],
  },
  { id: 'anthropic-ai', label: 'anthropic-ai', userAgents: ['anthropic-ai'] },
];

const LLMS_AGENT_ALIASES = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Google-CloudVertexBot',
  'meta-externalagent',
  'FacebookExternalHit',
  'Applebot-Extended',
  'Bytespider',
  'CCBot',
  'OAI-SearchBot',
  'OpenAI',
  'anthropic-ai',
];

function normalizeDomainTarget(input) {
  if (typeof input !== 'string') return null;
  const normalized = normalizeUrl(input);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    return { hostname: parsed.hostname.toLowerCase(), normalized };
  } catch {
    return null;
  }
}

// ---- robots.txt parser + access evaluator ----
function parseRobotsTxt(content) {
  const groups = [];
  if (!content || typeof content !== 'string') return groups;

  const lines = content.split(/\r?\n/);
  let currentGroup = null;
  let seenRule = false;

  for (const rawLine of lines) {
    const commentIndex = rawLine.indexOf('#');
    const line = (commentIndex >= 0 ? rawLine.slice(0, commentIndex) : rawLine).trim();
    if (!line) continue;
    const delimiterIndex = line.indexOf(':');
    if (delimiterIndex === -1) continue;
    const field = line.slice(0, delimiterIndex).trim().toLowerCase();
    const value = line.slice(delimiterIndex + 1).trim();

    if (field === 'user-agent') {
      if (!currentGroup) {
        currentGroup = { agents: [], rules: [] };
        seenRule = false;
      } else if (seenRule) {
        groups.push(currentGroup);
        currentGroup = { agents: [], rules: [] };
        seenRule = false;
      }
      if (value) currentGroup.agents.push(value.toLowerCase());
      continue;
    }

    if (field === 'allow' || field === 'disallow') {
      if (!currentGroup) currentGroup = { agents: ['*'], rules: [] };
      currentGroup.rules.push({ type: field, value });
      seenRule = true;
    }
  }

  if (currentGroup && (currentGroup.agents.length || currentGroup.rules.length)) {
    groups.push(currentGroup);
  }

  return groups;
}

function pathMatchesRule(rulePath, targetPath = '/') {
  const normalizedTarget = targetPath || '/';
  const path = typeof rulePath === 'string' ? rulePath.trim() : '';
  if (path === '') return true;

  const hasEndAnchor = path.endsWith('$');
  const base = hasEndAnchor ? path.slice(0, -1) : path;
  const escaped = base.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '.*');
  const regex = new RegExp(`^${escaped}${hasEndAnchor ? '$' : ''}`, 'i');
  return regex.test(normalizedTarget);
}

function evaluateRulesForPath(rules, path = '/') {
  if (!Array.isArray(rules) || rules.length === 0) return { allowed: true, rule: null };

  let best = null;
  rules.forEach((rule) => {
    if (!rule || !rule.type) return;
    const value = typeof rule.value === 'string' ? rule.value.trim() : '';
    if (rule.type === 'disallow' && value === '') return;
    const matches = pathMatchesRule(value, path);
    if (!matches) return;
    const score = value.length;
    if (
      !best ||
      score > best.score ||
      (score === best.score && rule.type === 'allow' && best.type === 'disallow')
    ) {
      best = { type: rule.type, value, score };
    }
  });

  if (!best) return { allowed: true, rule: null };
  return { allowed: best.type !== 'disallow', rule: best };
}

function findBestGroupForAgent(groups, userAgent) {
  const normalized = (userAgent || '').toLowerCase();
  let best = null;

  groups.forEach((group) => {
    let matchLength = 0;
    let matchedAgent = null;
    group.agents.forEach((agent) => {
      const target = (agent || '').toLowerCase();
      if (!target) return;
      if (target === '*') {
        if (matchLength < 1) {
          matchLength = 1;
          matchedAgent = '*';
        }
        return;
      }
      if (normalized.startsWith(target) && target.length > matchLength) {
        matchLength = target.length;
        matchedAgent = target;
      }
    });

    if (matchLength > 0 && (!best || matchLength > best.matchLength)) {
      best = { group, matchLength, matchedAgent };
    }
  });

  return best;
}

function evaluateAgentAccess(groups, aliases, { path = '/', missingRobots = false } = {}) {
  if (!Array.isArray(aliases) || aliases.length === 0) {
    return {
      allowed: true,
      matchedAgent: null,
      matchedRule: null,
      matchedAlias: null,
      reason: 'No user-agent aliases defined.',
    };
  }

  if (!Array.isArray(groups) || groups.length === 0) {
    return {
      allowed: true,
      matchedAgent: null,
      matchedRule: null,
      matchedAlias: aliases[0],
      reason: missingRobots
        ? 'robots.txt missing; default allow applies.'
        : 'No robots directives found; default allow applies.',
    };
  }

  const normalizedAliases = aliases.map((alias) => alias.toLowerCase());
  let best = null;

  normalizedAliases.forEach((alias) => {
    const match = findBestGroupForAgent(groups, alias);
    if (!match) return;
    const ruleResult = evaluateRulesForPath(match.group.rules, path);
    const candidate = {
      matchedAgent: match.matchedAgent,
      matchedRule: ruleResult.rule,
      allowed: ruleResult.allowed,
      matchLength: match.matchLength,
      ruleScore: ruleResult.rule ? ruleResult.rule.score || ruleResult.rule.value.length : -1,
      alias,
    };

    if (!best) {
      best = candidate;
      return;
    }
    if (candidate.matchLength > best.matchLength) {
      best = candidate;
      return;
    }
    if (candidate.matchLength === best.matchLength && candidate.ruleScore > best.ruleScore) {
      best = candidate;
    }
  });

  if (!best) {
    return {
      allowed: true,
      matchedAgent: null,
      matchedRule: null,
      matchedAlias: aliases[0],
      reason: 'No matching user-agent rules; default allow applies.',
    };
  }

  let reason;
  if (!best.matchedRule) {
    reason =
      best.matchedAgent === '*'
        ? 'Wildcard group applies with no blocking rules.'
        : 'No specific directives for this bot; allowed by default.';
  } else {
    const directive = `${best.matchedRule.type === 'disallow' ? 'Disallow' : 'Allow'}: ${best.matchedRule.value || '/'}`;
    reason =
      best.matchedRule.type === 'disallow'
        ? `Blocked by ${directive}`
        : `Explicitly allowed by ${directive}`;
  }

  return {
    allowed: best.allowed,
    matchedAgent: best.matchedAgent,
    matchedRule: best.matchedRule,
    matchedAlias: best.alias,
    reason,
  };
}

// ---- robots.txt fetcher (https with http fallback) ----
async function fetchRobotsTxt(hostname) {
  if (!hostname) throw new Error('Hostname is required to fetch robots.txt');

  const candidates = [`https://${hostname}/robots.txt`, `http://${hostname}/robots.txt`];
  const notes = [];
  let lastError = null;

  for (const url of candidates) {
    try {
      // User-supplied domain; tolerate misconfigured certs.
      const response = await fetchWithSmartAgent(url, {
        headers: { 'User-Agent': ROBOTS_CHECKER_USER_AGENT, Accept: 'text/plain,*/*;q=0.8' },
        timeout: 8000,
        allowInsecureRetry: true,
      });
      const body = await response.text().catch(() => '');
      const resolvedUrl = response.url || url;

      if (response.status === 200) {
        return {
          url: resolvedUrl,
          status: response.status,
          body,
          via: url.startsWith('https://') ? 'https' : 'http',
          notes,
        };
      }

      if (response.status === 404 || response.status === 410) {
        notes.push(`robots.txt returned HTTP ${response.status} at ${resolvedUrl}`);
        return {
          url: resolvedUrl,
          status: response.status,
          body: '',
          via: url.startsWith('https://') ? 'https' : 'http',
          notes,
        };
      }

      lastError = `robots.txt responded with HTTP ${response.status}`;
      notes.push(`${lastError} at ${resolvedUrl}`);
    } catch (error) {
      lastError = error.message || 'Failed to fetch robots.txt';
      notes.push(`${lastError} at ${url}`);
    }
  }

  throw new Error(lastError || 'Unable to fetch robots.txt');
}

async function fetchTextWithFallback(hostname, pathFragment) {
  if (!hostname) throw new Error('Hostname is required');
  const pathPart = pathFragment.startsWith('/') ? pathFragment : `/${pathFragment}`;
  const candidates = [`https://${hostname}${pathPart}`, `http://${hostname}${pathPart}`];
  const notes = [];
  let lastError = null;

  for (const url of candidates) {
    try {
      const response = await fetchWithSmartAgent(url, {
        headers: { 'User-Agent': ROBOTS_CHECKER_USER_AGENT, Accept: 'text/plain,*/*;q=0.8' },
        timeout: 8000,
        allowInsecureRetry: true,
      });
      const body = await response.text().catch(() => '');
      const resolvedUrl = response.url || url;

      if (response.status === 200) {
        return {
          url: resolvedUrl,
          status: response.status,
          body,
          via: url.startsWith('https://') ? 'https' : 'http',
          notes,
        };
      }

      if (response.status === 404 || response.status === 410) {
        notes.push(`${pathPart} returned HTTP ${response.status} at ${resolvedUrl}`);
        return {
          url: resolvedUrl,
          status: response.status,
          body: '',
          via: url.startsWith('https://') ? 'https' : 'http',
          notes,
        };
      }

      lastError = `${pathPart} responded with HTTP ${response.status}`;
      notes.push(`${lastError} at ${resolvedUrl}`);
    } catch (error) {
      lastError = error.message || `Failed to fetch ${pathPart}`;
      notes.push(`${lastError} at ${url}`);
    }
  }

  throw new Error(lastError || `Unable to fetch ${pathPart}`);
}

// ---- Sitemap → URL list (used by llms.txt generator) ----
function toTitleCase(value = '') {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function labelFromSource(sourceUrl) {
  if (!sourceUrl) return 'URLs';
  try {
    const { pathname } = new URL(sourceUrl);
    const base = pathname.split('/').filter(Boolean).pop() || '';
    const withoutExt = base.replace(/\.xml$/i, '');
    if (!withoutExt) return 'URLs';
    const sanitized = withoutExt.replace(/\d+$/g, '').replace(/[-_]+$/, '');
    const title = toTitleCase(sanitized || withoutExt);
    return title || 'URLs';
  } catch {
    return 'URLs';
  }
}

function titleFromUrl(url) {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.split('/').filter(Boolean);
    const last = parts.pop() || '';
    const clean = decodeURIComponent(last.replace(/[-_]+/g, ' ')).trim();
    if (clean) return toTitleCase(clean);
    return url;
  } catch {
    return url;
  }
}

function parseSitemapEntries(xml) {
  const results = { sitemaps: [], urls: [] };
  if (!xml || typeof xml !== 'string') return results;

  const sitemapBlocks = xml.match(/<sitemap[^>]*>[\s\S]*?<\/sitemap>/gi) || [];
  sitemapBlocks.forEach((block) => {
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/i);
    if (locMatch && locMatch[1]) results.sitemaps.push(locMatch[1].trim());
  });

  const urlBlocks = xml.match(/<url[^>]*>[\s\S]*?<\/url>/gi) || [];
  urlBlocks.forEach((block) => {
    const locMatch = block.match(/<loc>([^<]+)<\/loc>/i);
    if (locMatch && locMatch[1]) results.urls.push(locMatch[1].trim());
  });

  if (!results.urls.length && !results.sitemaps.length) {
    const locs = xml.match(/<loc>([^<]+)<\/loc>/gi) || [];
    locs.forEach((entry) => {
      const clean = entry.replace(/<\/?loc>/gi, '').trim();
      if (clean) results.urls.push(clean);
    });
  }

  return results;
}

async function fetchSitemapUrls(hostname, limit = 200) {
  const notes = [];
  const visited = new Set();
  const queue = [`https://${hostname}/sitemap.xml`, `http://${hostname}/sitemap.xml`];
  const collected = [];
  const discoveredSitemaps = [];
  let sitemapUrl = null;
  let lastStatus = null;
  const maxRequests = 30;
  let requests = 0;

  while (queue.length && collected.length < limit && requests < maxRequests) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    requests += 1;

    try {
      const response = await fetchWithSmartAgent(current, {
        headers: {
          'User-Agent': ROBOTS_CHECKER_USER_AGENT,
          Accept: 'application/xml,text/xml;q=0.9,text/plain;q=0.8,*/*;q=0.8',
        },
        timeout: 9000,
        allowInsecureRetry: true,
      });
      lastStatus = response.status;
      const body = await response.text().catch(() => '');
      const resolvedUrl = response.url || current;
      if (!sitemapUrl && response.ok) sitemapUrl = resolvedUrl;
      if (response.ok) discoveredSitemaps.push(resolvedUrl);
      if (!response.ok) {
        notes.push(`Sitemap responded with HTTP ${response.status} at ${resolvedUrl}`);
        continue;
      }

      const { sitemaps, urls } = parseSitemapEntries(body);
      sitemaps
        .filter((loc) => {
          try {
            const parsed = new URL(loc);
            return parsed.hostname === hostname;
          } catch {
            return false;
          }
        })
        .forEach((loc) => queue.push(loc));

      urls.forEach((loc) => {
        if (collected.length >= limit) return;
        try {
          const normalized = new URL(loc).toString();
          if (normalized && !collected.includes(normalized)) {
            collected.push({ url: normalized, source: resolvedUrl });
          }
        } catch {
          // ignore invalid URLs
        }
      });
    } catch (error) {
      notes.push(`Failed fetching sitemap at ${current}: ${error.message || error}`);
    }
  }

  return {
    sitemapUrl,
    status: lastStatus,
    urls: collected.slice(0, limit),
    sitemaps: discoveredSitemaps,
    notes,
  };
}

function buildLlmsTxt({ hostname, urls = [], sitemapUrl = null }) {
  const lines = [];
  lines.push(`# ${hostname}`);
  lines.push('');
  lines.push('## Crawler Policies');
  LLMS_AGENT_ALIASES.forEach((agent) => {
    lines.push(`User-agent: ${agent}`);
    lines.push('Allow: /');
    lines.push('');
  });

  if (sitemapUrl) {
    lines.push(`Sitemap: ${sitemapUrl}`);
    lines.push('');
  }

  const grouped = new Map();
  urls.forEach((entry) => {
    const url = typeof entry === 'string' ? entry : entry?.url;
    const source = typeof entry === 'object' ? entry.source : null;
    if (!url) return;
    const label = labelFromSource(source);
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push({ url, title: titleFromUrl(url) });
  });

  if (grouped.size === 0) {
    lines.push('## URLs');
    lines.push('- No URLs detected; add a sitemap.xml for better coverage.');
    return lines.join('\n');
  }

  grouped.forEach((items, label) => {
    lines.push(`## ${label}`);
    lines.push('');
    items.forEach((item) => {
      lines.push(`- [${item.title}](${item.url})`);
    });
    lines.push('');
  });

  return lines.join('\n');
}

module.exports = {
  AI_CRAWLER_AGENTS,
  LLMS_AGENT_ALIASES,
  ROBOTS_CHECKER_USER_AGENT,
  normalizeDomainTarget,
  parseRobotsTxt,
  pathMatchesRule,
  evaluateRulesForPath,
  findBestGroupForAgent,
  evaluateAgentAccess,
  fetchRobotsTxt,
  fetchTextWithFallback,
  parseSitemapEntries,
  fetchSitemapUrls,
  buildLlmsTxt,
};
