'use strict';

const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { fetchWithSmartAgent } = require('../utils/smartFetch');
const { SCHEMA_AUTOFILL_USER_AGENT: AUTOFILL_USER_AGENT } = require('../config/env');
const {
  STOPWORDS,
  decodeHtmlEntities,
  stripTags,
  safeArray,
  matchSchemaType,
  toAbsolute,
  parseJsonLdBlocks,
  extractMultilineString,
  normalizePostalAddress,
  extractNavigationLinks,
} = require('../utils/htmlScrape');

const MAX_AUTOFILL_CITATIONS = 10;

const extractCidFromMapUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    if (url.searchParams.has('cid')) return url.searchParams.get('cid');
  } catch {
    // ignore
  }
  const decoded = decodeURIComponent(raw);
  const match = decoded.match(/cid=([\d]+)/i);
  return match ? match[1] : null;
};

const collapseSpaces = (value = '') => value.replace(/\s+/g, ' ').trim();

const extractArticleBody = ($) => {
  const selectors = [
    'article',
    'main article',
    '.post-content',
    '.entry-content',
    '.article-content',
    '.blog-content',
    '.content',
  ];
  for (const selector of selectors) {
    const text = collapseSpaces(stripTags($(selector).text() || ''));
    if (text && text.length > 300) return text.slice(0, 6000);
  }
  const paragraphs = $('main p')
    .map((_, el) => $(el).text())
    .get()
    .filter(Boolean)
    .slice(0, 25)
    .join(' ');
  if (paragraphs) return collapseSpaces(stripTags(paragraphs)).slice(0, 6000);
  const fallback = $('body')
    .find('p')
    .map((_, el) => $(el).text())
    .get()
    .slice(0, 20)
    .join(' ');
  return collapseSpaces(stripTags(fallback)).slice(0, 6000);
};

const extractFaqFromDom = ($) => {
  const items = [];
  const MAX_FAQ = 20;

  $('details').each((_, el) => {
    if (items.length >= MAX_FAQ) return false;
    const $el = $(el);
    const question = $el.find('summary').first().text().trim();
    const $clone = $el.clone();
    $clone.find('summary').remove();
    const answer = $clone.text().trim();
    if (question && answer) items.push({ question, answer });
  });

  if (items.length) return items;

  $('[class*="faq" i], [id*="faq" i]').each((_, container) => {
    if (items.length >= MAX_FAQ) return false;
    const $container = $(container);
    $container.find('h2, h3, h4').each((_, heading) => {
      if (items.length >= MAX_FAQ) return false;
      const question = $(heading).text().trim();
      const $next = $(heading).next('p, div');
      const answer = $next.length ? $next.text().trim() : '';
      if (question && answer) items.push({ question, answer });
    });
  });

  return items;
};

const generateKeywordList = (text, fallback = []) => {
  const keywords = new Set();
  fallback.forEach((item) => {
    if (item) keywords.add(item);
  });
  if (text) {
    const tokens = text.toLowerCase().match(/\b[a-z0-9]{4,}\b/g) || [];
    const freq = tokens.reduce((acc, token) => {
      if (STOPWORDS.has(token)) return acc;
      acc[token] = (acc[token] || 0) + 1;
      return acc;
    }, {});
    const sorted = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([token]) => token);
    for (const token of sorted) {
      if (keywords.size >= 12) break;
      keywords.add(token);
    }
  }
  return Array.from(keywords);
};

const generateAssesses = (body, description) => {
  if (description) return collapseSpaces(description).slice(0, 500);
  if (!body) return '';
  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => collapseSpaces(sentence))
    .filter(Boolean);
  return sentences.slice(0, 2).join(' ').slice(0, 500);
};

const crawlCitationMetadata = async (targetUrl) => {
  const response = await fetchWithSmartAgent(targetUrl, {
    headers: {
      'User-Agent': AUTOFILL_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
    // User-supplied citation URL — tolerate misconfigured certs.
    allowInsecureRetry: true,
  });
  if (!response.ok) {
    throw new Error(`Citation request failed with status ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  const canonical = $('link[rel="canonical"]').attr('href');
  const finalUrl = canonical ? toAbsolute(targetUrl, canonical) : targetUrl;
  const headline = decodeHtmlEntities(
    $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('meta[name="title"]').attr('content') ||
      $('title').text() ||
      $('h1').first().text(),
  ).trim();
  const siteMeta =
    $('meta[property="og:site_name"]').attr('content') ||
    $('meta[name="application-name"]').attr('content') ||
    $('meta[name="publisher"]').attr('content') ||
    '';
  let creatorName = decodeHtmlEntities(siteMeta).trim();
  let creatorUrl = '';
  try {
    const parsed = new URL(finalUrl);
    creatorUrl = `${parsed.protocol}//${parsed.hostname}/`;
    if (!creatorName) creatorName = parsed.hostname.replace(/^www\./i, '');
  } catch {
    creatorUrl = finalUrl;
    if (!creatorName) creatorName = finalUrl;
  }
  const creator = creatorName || creatorUrl ? { name: creatorName, url: creatorUrl } : undefined;
  return { headline: headline || finalUrl, url: finalUrl, creatorName, creatorUrl, creator };
};

const extractAutofillPayload = (html, sourceUrl, options = {}) => {
  const $ = cheerio.load(html);
  const jsonLdNodes = parseJsonLdBlocks($);
  const includeReviews = Boolean(options.mapUrl);

  const getMeta = (selector) => ($(selector).attr('content') || '').trim();
  const ogImages = extractMultilineString(getMeta('meta[property="og:image"]'));
  const canonical = $('link[rel="canonical"]').attr('href');
  const finalUrl = canonical ? toAbsolute(sourceUrl, canonical.trim()) : sourceUrl;
  const keywords = extractMultilineString($('meta[name="keywords"]').attr('content') || '');
  const heading = $('h1').first().text().trim();
  const pageTitle = $('title').text().trim();
  const lang = $('html').attr('lang') || 'en';
  const siteName =
    getMeta('meta[property="og:site_name"]') || getMeta('meta[name="application-name"]') || '';
  const metaDescription =
    getMeta('meta[name="description"]') || getMeta('meta[property="og:description"]') || '';
  const metaAuthor = getMeta('meta[name="author"]') || siteName || '';
  const articleBody = extractArticleBody($);

  const webPageNode =
    jsonLdNodes.find((node) =>
      matchSchemaType(node, 'webpage', 'profilepage', 'collectionpage'),
    ) || null;
  const articleNode =
    jsonLdNodes.find((node) =>
      matchSchemaType(node, 'article', 'newsarticle', 'blogposting', 'reportagenewsarticle'),
    ) || null;
  const articleKeywordSeed = articleNode
    ? extractMultilineString(articleNode.keywords || articleNode.genre || keywords)
    : extractMultilineString(keywords);
  const keywordList = generateKeywordList(articleBody, articleKeywordSeed);
  const assesses = generateAssesses(articleBody, articleNode?.description || metaDescription);
  const faqNode = jsonLdNodes.find((node) => matchSchemaType(node, 'faqpage')) || null;
  const breadcrumbNode =
    jsonLdNodes.find((node) => matchSchemaType(node, 'breadcrumblist')) || null;
  const localBusinessNode =
    jsonLdNodes.find((node) =>
      matchSchemaType(
        node,
        'localbusiness',
        'organization',
        'professionalservice',
        'homeandconstructionbusiness',
        'medicalbusiness',
      ),
    ) || null;
  const serviceNode = jsonLdNodes.find((node) => matchSchemaType(node, 'service')) || null;
  const reviewNodes = jsonLdNodes.filter((node) => matchSchemaType(node, 'review'));

  const aboutEntities = safeArray(webPageNode?.about).map((item) => ({
    name: item?.name || item?.headline || item?.['@id'] || '',
    description: item?.description || '',
    sameAs: extractMultilineString(item?.sameAs || item?.url).map((link) => toAbsolute(finalUrl, link)),
  }));
  const mentionEntities = safeArray(webPageNode?.mentions).map((item) => ({
    name: item?.name || '',
    description: item?.description || '',
    sameAs: extractMultilineString(item?.sameAs || item?.url).map((link) => toAbsolute(finalUrl, link)),
  }));
  const citations = safeArray(webPageNode?.citation).map((item) => {
    const citationUrl = item?.url ? toAbsolute(finalUrl, item.url) : '';
    let creatorName =
      item?.creator?.name ||
      item?.publisher?.name ||
      item?.isPartOf?.name ||
      item?.author?.name ||
      '';
    let creatorUrl =
      item?.creator?.url || item?.publisher?.url || item?.isPartOf?.url || '';
    if (!creatorUrl && citationUrl) {
      try {
        const parsed = new URL(citationUrl);
        creatorUrl = `${parsed.protocol}//${parsed.hostname}/`;
        if (!creatorName) creatorName = parsed.hostname.replace(/^www\./i, '');
      } catch {
        // ignore
      }
    }
    const creator =
      creatorName || creatorUrl ? { name: creatorName, url: creatorUrl } : undefined;
    return {
      headline: item?.headline || item?.name || '',
      url: citationUrl,
      creatorName,
      creatorUrl,
      creator,
    };
  });

  const serviceAreas = safeArray(serviceNode?.areaServed).map((entry) => ({
    name: entry?.name || entry?.addressLocality || entry?.addressRegion || '',
    urls: extractMultilineString(entry?.url).map((link) => toAbsolute(finalUrl, link)),
  }));

  const navigationLinks = extractNavigationLinks($, finalUrl);

  let breadcrumbItems =
    breadcrumbNode?.itemListElement
      ?.map((entry) => {
        if (!entry) return null;
        if (entry.item) {
          return {
            name: entry.item.name || entry.name || '',
            url: entry.item['@id']
              ? toAbsolute(finalUrl, entry.item['@id'])
              : toAbsolute(finalUrl, entry.item.url || ''),
          };
        }
        return {
          name: entry.name || '',
          url: entry['@id'] ? toAbsolute(finalUrl, entry['@id']) : '',
        };
      })
      .filter((entry) => entry && entry.name) || [];
  if (!breadcrumbItems.length && navigationLinks.length) {
    breadcrumbItems = navigationLinks.map((link) => ({ name: link.name, url: link.url }));
  }

  const jsonLdFaqItems =
    faqNode?.mainEntity
      ?.map((entity) => ({
        question: entity?.name || '',
        answer: entity?.acceptedAnswer?.text || entity?.acceptedAnswer?.description || '',
      }))
      .filter((entry) => entry.question && entry.answer) || [];
  const faqItems = jsonLdFaqItems.length ? jsonLdFaqItems : extractFaqFromDom($);

  const localAddress = normalizePostalAddress(localBusinessNode?.address, finalUrl) || {};
  const geoLat = localBusinessNode?.geo?.latitude || localAddress.latitude || '';
  const geoLng = localBusinessNode?.geo?.longitude || localAddress.longitude || '';
  const openingHours = extractMultilineString(localBusinessNode?.openingHours).length
    ? extractMultilineString(localBusinessNode.openingHours)
    : safeArray(localBusinessNode?.openingHoursSpecification)
        .map((spec) => {
          if (!spec?.dayOfWeek) return '';
          const days = safeArray(spec.dayOfWeek)
            .map((day) => day.replace('https://schema.org/', ''))
            .join(', ');
          if (!spec?.opens || !spec?.closes) return days;
          return `${days}: ${spec.opens}-${spec.closes}`;
        })
        .filter(Boolean);

  const aggregateRating = localBusinessNode?.aggregateRating
    ? { ...localBusinessNode.aggregateRating }
    : serviceNode?.aggregateRating
      ? { ...serviceNode.aggregateRating }
      : {};

  const normalizedReviews = [];
  const pushReviewEntry = (entry) => {
    if (!entry) return;
    normalizedReviews.push({
      author: entry.author?.name || entry.author || '',
      body: entry.reviewBody || entry.description || '',
      name: entry.name || '',
      ratingValue: entry.reviewRating?.ratingValue || entry.reviewRating || '',
      datePublished: entry.datePublished || entry.dateCreated || '',
      url: entry.url ? toAbsolute(finalUrl, entry.url) : '',
    });
  };

  safeArray(localBusinessNode?.review).forEach(pushReviewEntry);
  reviewNodes.forEach(pushReviewEntry);

  const imageCandidates = [
    ...ogImages,
    ...$('img')
      .map((_, img) => $(img).attr('src'))
      .get()
      .filter(Boolean)
      .slice(0, 10)
      .map((src) => toAbsolute(finalUrl, src)),
  ].filter(Boolean);

  const reviewsPayload = (() => {
    if (!includeReviews) return null;
    const filteredReviews = normalizedReviews.filter(
      (entry) => entry.author || entry.body || entry.ratingValue,
    );
    if (
      !filteredReviews.length &&
      !aggregateRating?.ratingValue &&
      !aggregateRating?.ratingCount &&
      !aggregateRating?.reviewCount
    ) {
      return null;
    }
    return {
      itemReviewed:
        localBusinessNode?.['@id'] ||
        serviceNode?.['@id'] ||
        articleNode?.['@id'] ||
        finalUrl,
      aggregateRating: {
        ratingValue: aggregateRating?.ratingValue || '',
        ratingCount: aggregateRating?.ratingCount || aggregateRating?.reviewCount || '',
        bestRating: aggregateRating?.bestRating || '',
        worstRating: aggregateRating?.worstRating || '',
      },
      reviews: filteredReviews,
    };
  })();

  const composeArticlePayload = (node = {}) => ({
    id: node['@id'] || `${finalUrl}#article`,
    url: node.url ? toAbsolute(finalUrl, node.url) : finalUrl,
    headline: node.headline || node.name || heading || pageTitle,
    name: node.name || node.headline || heading || pageTitle,
    description: node.description || metaDescription || heading || '',
    articleBody: articleBody || '',
    articleSection: node.articleSection || '',
    keywords: keywordList,
    assesses,
    datePublished: node.datePublished || '',
    dateModified: node.dateModified || '',
    authorName: node.author?.name || metaAuthor || '',
    authorType: node.author?.['@type'] || 'Organization',
    authorId: node.author?.['@id'] || '',
    publisherName: node.publisher?.name || siteName || '',
    publisherType: node.publisher?.['@type'] || 'Organization',
    isAccessibleForFree:
      typeof node.isAccessibleForFree === 'boolean' ? node.isAccessibleForFree : true,
    isFamilyFriendly:
      typeof node.isFamilyFriendly === 'boolean' ? node.isFamilyFriendly : true,
    isPartOf:
      (typeof node.isPartOf === 'string' && node.isPartOf) ||
      node.isPartOf?.['@id'] ||
      webPageNode?.['@id'] ||
      `${finalUrl}#webpage`,
    mainEntityId: node.mainEntityOfPage?.['@id'] || '',
    imageUrls: extractMultilineString(node.image || node.image?.url || imageCandidates.slice(0, 3)),
  });

  const articlePayload =
    articleNode || articleBody || metaDescription ? composeArticlePayload(articleNode || {}) : null;

  return {
    source: finalUrl,
    meta: {
      title: getMeta('meta[property="og:title"]') || $('title').text().trim(),
      description: getMeta('meta[property="og:description"]') || getMeta('meta[name="description"]') || '',
      keywords,
      heading,
      language: lang,
      canonical: finalUrl,
      images: Array.from(new Set(imageCandidates)),
    },
    webPage: {
      id: finalUrl,
      mainEntityOfPage: webPageNode?.mainEntity?.['@id'] || '',
      headline:
        webPageNode?.headline ||
        webPageNode?.name ||
        getMeta('meta[property="og:title"]') ||
        $('title').text().trim(),
      alternativeHeadline: webPageNode?.alternativeHeadline || '',
      description: webPageNode?.description || metaDescription || '',
      datePublished: webPageNode?.datePublished || articleNode?.datePublished || '',
      dateModified: webPageNode?.dateModified || articleNode?.dateModified || '',
      language: lang,
      keywords,
      publisherId: webPageNode?.publisher?.['@id'] || '',
      significantLinks: extractMultilineString(webPageNode?.significantLink).map((link) =>
        toAbsolute(finalUrl, link),
      ),
      relatedLinks: extractMultilineString(webPageNode?.relatedLink).map((link) =>
        toAbsolute(finalUrl, link),
      ),
      about: aboutEntities,
      mentions: mentionEntities,
      citations,
    },
    article: articlePayload,
    breadcrumbs: breadcrumbItems,
    faq: faqItems,
    service: serviceNode
      ? {
          id: serviceNode['@id'] || serviceNode.url || '',
          serviceType: serviceNode.serviceType || serviceNode.name || '',
          url: serviceNode.url ? toAbsolute(finalUrl, serviceNode.url) : '',
          sameAs: extractMultilineString(serviceNode.sameAs).map((link) => toAbsolute(finalUrl, link)),
          providerName: serviceNode.provider?.name || serviceNode.provider?.legalName || '',
          providerType: serviceNode.provider?.['@type'] || 'Organization',
          telephone: serviceNode.provider?.telephone || localBusinessNode?.telephone || '',
          priceRange: serviceNode.provider?.priceRange || localBusinessNode?.priceRange || '',
          street: serviceNode.provider?.address?.streetAddress || localAddress.street || '',
          city: serviceNode.provider?.address?.addressLocality || localAddress.city || '',
          region: serviceNode.provider?.address?.addressRegion || localAddress.region || '',
          postalCode: serviceNode.provider?.address?.postalCode || localAddress.postalCode || '',
          country: serviceNode.provider?.address?.addressCountry || localAddress.country || '',
          geoLat: serviceNode.provider?.geo?.latitude || geoLat || '',
          geoLng: serviceNode.provider?.geo?.longitude || geoLng || '',
          hasMap: serviceNode.provider?.hasMap
            ? toAbsolute(finalUrl, serviceNode.provider.hasMap)
            : localAddress.map || '',
          serviceAreas,
        }
      : null,
    localBusiness: localBusinessNode
      ? {
          id: localBusinessNode['@id'] || localBusinessNode.url || finalUrl,
          name: localBusinessNode.name || '',
          url: localBusinessNode.url ? toAbsolute(finalUrl, localBusinessNode.url) : finalUrl,
          telephone: localBusinessNode.telephone || '',
          priceRange: localBusinessNode.priceRange || '',
          image: localBusinessNode.image
            ? toAbsolute(finalUrl, localBusinessNode.image)
            : imageCandidates[0] || '',
          sameAs: extractMultilineString(localBusinessNode.sameAs).map((link) =>
            toAbsolute(finalUrl, link),
          ),
          email: localBusinessNode.email || '',
          street: localAddress.street || '',
          city: localAddress.city || '',
          region: localAddress.region || '',
          postalCode: localAddress.postalCode || '',
          country: localAddress.country || '',
          geoLat: geoLat || '',
          geoLng: geoLng || '',
          hasMap: localAddress.map || '',
          openingHours,
        }
      : null,
    reviews: reviewsPayload,
    images: imageCandidates,
  };
};

module.exports = {
  MAX_AUTOFILL_CITATIONS,
  AUTOFILL_USER_AGENT,
  extractCidFromMapUrl,
  collapseSpaces,
  extractArticleBody,
  extractFaqFromDom,
  generateKeywordList,
  generateAssesses,
  crawlCitationMetadata,
  extractAutofillPayload,
};

// Re-exports for downstream consumers (e.g. SERP/business-detail Serper integration).
module.exports.htmlUtils = {
  STOPWORDS,
  decodeHtmlEntities,
  stripTags,
  safeArray,
  matchSchemaType,
  toAbsolute,
  parseJsonLdBlocks,
  extractMultilineString,
  normalizePostalAddress,
  extractNavigationLinks,
};
