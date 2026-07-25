'use strict';

const logger = require('./logger');

const STOPWORDS = new Set([
  'the','and','for','that','with','this','from','have','your','about','they','them','their','will',
  'what','when','were','been','into','said','such','than','some','more','only','just','over','also',
  'you','our','are','was','but','not','all','any','can','has','had','its','his','her','she','him',
  'who','how','why','where','which','while','shall','should','could','would','there','here','after',
  'before','each','other','because','within','without','upon','very','much','many','ever','never',
  'make','made','like','love','year','years','month','months','day','week','weeks','home','city',
  'state','country','people','services','service',
]);

function decodeHtmlEntities(value) {
  if (!value) return '';
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '--')
    .replace(/&#8230;/g, '...')
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(value) {
  return (value || '').replace(/<\/?[^>]+>/g, ' ');
}

const safeArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
};

const matchSchemaType = (node, ...targets) => {
  if (!node || !node['@type']) return false;
  const types = safeArray(node['@type']).map((entry) => String(entry).toLowerCase());
  return targets.some((target) => types.includes(String(target).toLowerCase()));
};

const toAbsolute = (base, raw) => {
  if (!raw || typeof raw !== 'string') return '';
  try {
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
};

const flattenJsonLdNodes = (node, target = []) => {
  if (!node) return target;
  if (Array.isArray(node)) {
    node.forEach((entry) => flattenJsonLdNodes(entry, target));
    return target;
  }
  target.push(node);
  if (node['@graph']) {
    flattenJsonLdNodes(node['@graph'], target);
  }
  return target;
};

const parseJsonLdBlocks = ($) => {
  const nodes = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text().trim();
    if (!raw) return;
    try {
      flattenJsonLdNodes(JSON.parse(raw), nodes);
      return;
    } catch {
      try {
        const sanitized = raw.replace(/\\n/g, '').replace(/\s{2,}/g, ' ').trim();
        flattenJsonLdNodes(JSON.parse(sanitized), nodes);
      } catch (error) {
        logger.warn({ msg: error.message }, 'Failed parsing JSON-LD block');
      }
    }
  });
  return nodes;
};

const extractMultilineString = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizePostalAddress = (raw = {}, baseUrl = '') => {
  if (!raw || typeof raw !== 'object') return null;
  return {
    street: raw.streetAddress || '',
    city: raw.addressLocality || '',
    region: raw.addressRegion || '',
    postalCode: raw.postalCode || '',
    country: raw.addressCountry || '',
    latitude: raw.geo?.latitude || '',
    longitude: raw.geo?.longitude || '',
    map: raw.hasMap ? toAbsolute(baseUrl, raw.hasMap) : '',
  };
};

const extractNavigationLinks = ($, baseUrl) => {
  const selectors = [
    'nav a[href]',
    'header nav a[href]',
    '.menu a[href]',
    '.navigation a[href]',
    '.nav a[href]',
    '.navbar a[href]',
    '.site-nav a[href]',
    'ul[class*="menu"] a[href]',
    'li[class*="menu"] > a[href]',
  ];
  const fallbackSelectors = ['header a[href]', '.site-header a[href]', 'footer a[href]'];
  const seen = new Set();
  const links = [];

  const collect = (selectorList) => {
    $(selectorList.join(',')).each((_, element) => {
      const href = $(element).attr('href');
      if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;
      const text = decodeHtmlEntities(stripTags($(element).text() || '')).replace(/\s+/g, ' ').trim();
      if (!text) return;
      const absolute = toAbsolute(baseUrl, href);
      const key = `${text.toLowerCase()}|${absolute}`;
      if (seen.has(key)) return;
      seen.add(key);
      links.push({ name: text, url: absolute });
    });
  };

  collect(selectors);
  if (links.length < 5) collect(fallbackSelectors);
  if (links.length < 5) {
    $('main a[href]').each((_, element) => {
      if (links.length >= 80) return false;
      const href = $(element).attr('href');
      if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;
      const text = decodeHtmlEntities(stripTags($(element).text() || '')).replace(/\s+/g, ' ').trim();
      if (!text) return;
      const absolute = toAbsolute(baseUrl, href);
      const key = `${text.toLowerCase()}|${absolute}`;
      if (seen.has(key)) return;
      seen.add(key);
      links.push({ name: text, url: absolute });
    });
  }

  return links.slice(0, 100);
};

module.exports = {
  STOPWORDS,
  decodeHtmlEntities,
  stripTags,
  safeArray,
  matchSchemaType,
  toAbsolute,
  flattenJsonLdNodes,
  parseJsonLdBlocks,
  extractMultilineString,
  normalizePostalAddress,
  extractNavigationLinks,
};
