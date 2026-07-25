'use strict';

const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const logger = require('../utils/logger');
const googleOauth = require('./googleOauth');

// ---- AI engine registry --------------------------------------------------
// Kept in sync with client/src/features/ai-traffic-report/lib/ai-engines.ts.
// The server uses it to build the GA4 dimension filter; the client uses it
// to render colors and labels.
const AI_ENGINES = [
  { id: 'chatgpt', name: 'ChatGPT', color: '#10A37F', hostnames: ['chatgpt.com', 'chat.openai.com'] },
  { id: 'perplexity', name: 'Perplexity', color: '#1FB8CD', hostnames: ['perplexity.ai', 'www.perplexity.ai'] },
  { id: 'gemini', name: 'Gemini', color: '#4796E5', hostnames: ['gemini.google.com', 'bard.google.com'] },
  { id: 'copilot', name: 'Copilot', color: '#0078D4', hostnames: ['copilot.microsoft.com'] },
  { id: 'claude', name: 'Claude', color: '#CC785C', hostnames: ['claude.ai'] },
  { id: 'meta-ai', name: 'Meta AI', color: '#0866FF', hostnames: ['meta.ai', 'www.meta.ai'] },
  { id: 'you', name: 'You.com', color: '#7B61FF', hostnames: ['you.com'] },
  { id: 'poe', name: 'Poe', color: '#5436DA', hostnames: ['poe.com'] },
  { id: 'phind', name: 'Phind', color: '#1D8FE1', hostnames: ['www.phind.com', 'phind.com'] },
  { id: 'deepseek', name: 'DeepSeek', color: '#4D6BFE', hostnames: ['chat.deepseek.com'] },
  { id: 'mistral', name: 'Le Chat', color: '#FA500F', hostnames: ['chat.mistral.ai'] },
  { id: 'huggingchat', name: 'HuggingChat', color: '#FF9D00', hostnames: ['huggingface.co'] },
];

const ALL_AI_HOSTNAMES = AI_ENGINES.flatMap((e) => e.hostnames);
const HOST_TO_ENGINE = new Map(
  AI_ENGINES.flatMap((engine) => engine.hostnames.map((host) => [host, engine])),
);

function engineForHost(host) {
  return HOST_TO_ENGINE.get(String(host || '').toLowerCase());
}

function engineForUrl(url) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url.includes('://') ? url : `https://${url}`);
    return engineForHost(parsed.hostname);
  } catch {
    return undefined;
  }
}

function engineForSource(source) {
  if (!source) return undefined;
  const normalized = String(source).toLowerCase().trim();
  return engineForHost(normalized) || engineForUrl(normalized);
}

// ---- Google client -------------------------------------------------------
function oauthClient(accessToken) {
  const client = new OAuth2Client();
  client.setCredentials({ access_token: accessToken });
  return client;
}

async function listProperties(accessToken) {
  const admin = google.analyticsadmin({ version: 'v1beta', auth: oauthClient(accessToken) });
  const summaries = [];
  let pageToken;
  do {
    // eslint-disable-next-line no-await-in-loop
    const res = await admin.accountSummaries.list({ pageSize: 200, pageToken });
    for (const acc of res.data.accountSummaries || []) {
      for (const prop of acc.propertySummaries || []) {
        if (!prop.property) continue;
        summaries.push({
          id: prop.property.replace('properties/', ''),
          displayName: prop.displayName || prop.property,
          accountId: (acc.account || '').replace('accounts/', ''),
          accountName: acc.displayName || '',
        });
      }
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  summaries.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return summaries;
}

async function queryAiTraffic({ accessToken, propertyId, startDate, endDate }) {
  const data = google.analyticsdata({ version: 'v1beta', auth: oauthClient(accessToken) });

  const dimensionFilter = {
    orGroup: {
      expressions: [
        {
          filter: {
            fieldName: 'sessionSource',
            inListFilter: { values: ALL_AI_HOSTNAMES, caseSensitive: false },
          },
        },
        ...ALL_AI_HOSTNAMES.map((host) => ({
          filter: {
            fieldName: 'pageReferrer',
            stringFilter: { matchType: 'CONTAINS', value: host, caseSensitive: false },
          },
        })),
      ],
    },
  };

  const response = await data.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'date' },
        { name: 'pageReferrer' },
        { name: 'sessionSource' },
        { name: 'landingPage' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'engagedSessions' },
      ],
      dimensionFilter,
      limit: '100000',
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    },
  });

  const rows = (response.data.rows || []).map((r) => ({
    date: r.dimensionValues?.[0]?.value || '',
    pageReferrer: r.dimensionValues?.[1]?.value || '',
    sessionSource: r.dimensionValues?.[2]?.value || '',
    landingPage: r.dimensionValues?.[3]?.value || '',
    sessions: Number(r.metricValues?.[0]?.value || 0),
    users: Number(r.metricValues?.[1]?.value || 0),
    engagedSessions: Number(r.metricValues?.[2]?.value || 0),
  }));

  return aggregate(rows);
}

function aggregate(rows) {
  const byEngine = new Map();
  const byDate = new Map();
  const byPage = new Map();
  const totals = { sessions: 0, users: 0, engagedSessions: 0 };

  for (const row of rows) {
    const engine = engineForSource(row.sessionSource) || engineForUrl(row.pageReferrer);
    if (!engine) continue;

    totals.sessions += row.sessions;
    totals.users += row.users;
    totals.engagedSessions += row.engagedSessions;

    const e =
      byEngine.get(engine.id) || {
        engineId: engine.id,
        engineName: engine.name,
        color: engine.color,
        sessions: 0,
        users: 0,
        engagedSessions: 0,
      };
    e.sessions += row.sessions;
    e.users += row.users;
    e.engagedSessions += row.engagedSessions;
    byEngine.set(engine.id, e);

    const point =
      byDate.get(row.date) || { date: formatGa4Date(row.date), total: 0, perEngine: {} };
    point.total += row.sessions;
    point.perEngine[engine.id] = (point.perEngine[engine.id] || 0) + row.sessions;
    byDate.set(row.date, point);

    const pageKey = `${engine.id}|${row.landingPage}`;
    const tp =
      byPage.get(pageKey) || {
        page: row.landingPage || '/',
        engineId: engine.id,
        engineName: engine.name,
        sessions: 0,
      };
    tp.sessions += row.sessions;
    byPage.set(pageKey, tp);
  }

  const enginesPresent = AI_ENGINES.filter((e) => byEngine.has(e.id));

  const timeseries = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => {
      for (const engine of enginesPresent) {
        v.perEngine[engine.id] = v.perEngine[engine.id] || 0;
      }
      return v;
    });

  const byEngineArr = Array.from(byEngine.values()).sort((a, b) => b.sessions - a.sessions);
  const topPages = Array.from(byPage.values())
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 50);

  return {
    totals: {
      ...totals,
      engagementRate: totals.sessions ? totals.engagedSessions / totals.sessions : 0,
    },
    byEngine: byEngineArr,
    timeseries,
    topPages,
    enginesPresent,
  };
}

function formatGa4Date(raw) {
  if (!raw || raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

// ---- OAuth -----------------------------------------------------------------
// OAuth wiring lives in src/services/googleOauth.js (shared with GSC). The
// GA4-specific bit is just the scope list.

const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const SCOPES = ['openid', 'email', 'profile', GA4_SCOPE];

function buildAuthorizeUrl(args) {
  return googleOauth.buildAuthorizeUrl({ ...args, scopes: SCOPES });
}

module.exports = {
  AI_ENGINES,
  GA4_SCOPE,
  SCOPES,
  listProperties,
  queryAiTraffic,
  buildAuthorizeUrl,
  exchangeCodeForTokens: googleOauth.exchangeCodeForTokens,
  refreshAccessToken: googleOauth.refreshAccessToken,
  fetchUserInfo: googleOauth.fetchUserInfo,
  revokeToken: googleOauth.revokeToken,
};
