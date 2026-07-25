'use strict';

const logger = require('../utils/logger');
const { ensureFetch } = require('../utils/smartFetch');
const { getSystemApiKey } = require('../storage/systemSettings');
const { logApiRequest } = require('../services/apiLog');

/**
 * Check whether a business is listed on a specific citation source via the
 * Serper.dev Google Search API. Returns a result object describing whether
 * the listing was found and how closely each NAP field matches.
 */
async function checkCitationViaSerper(serperKey, audit, source) {
  const fetcher = await ensureFetch();
  const result = {
    found: false,
    foundUrl: '',
    foundName: '',
    foundAddress: '',
    foundPhone: '',
    foundWebsite: '',
    nameMatch: false,
    addressMatch: false,
    phoneMatch: false,
    websiteMatch: false,
  };

  const businessName = audit.business_name || '';
  const siteDomain = source.url ? new URL(source.url).hostname.replace('www.', '') : '';
  const searchQuery = `"${businessName}" site:${siteDomain}`;

  const response = await fetcher('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': serperKey,
    },
    body: JSON.stringify({ q: searchQuery, num: 10 }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Serper API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const organicResults = data.organic || [];
  const businessNameLower = businessName.toLowerCase();

  for (const item of organicResults) {
    const title = (item.title || '').toLowerCase();
    const snippet = (item.snippet || '').toLowerCase();
    const link = item.link || '';
    const combinedText = `${title} ${snippet}`;

    if (
      link.toLowerCase().includes(siteDomain.toLowerCase()) &&
      combinedText.includes(businessNameLower)
    ) {
      result.found = true;
      result.foundUrl = link;
      result.foundName = businessName;
      result.nameMatch = true;

      // Address match: at least 2 (or 40%) of the address tokens appear in title/snippet.
      if (audit.business_address) {
        const addressParts = audit.business_address
          .toLowerCase()
          .split(/[\s,]+/)
          .filter((p) => p.length > 2);
        const matchCount = addressParts.filter((part) => combinedText.includes(part)).length;
        result.addressMatch = matchCount >= Math.min(2, addressParts.length * 0.4);
        if (result.addressMatch) result.foundAddress = audit.business_address;
      } else {
        result.addressMatch = true;
      }

      // Phone match: last 7 or last 10 digits substring match.
      if (audit.business_phone) {
        const phoneDigits = audit.business_phone.replace(/\D/g, '');
        const phoneFound =
          phoneDigits.length >= 7 &&
          (combinedText.includes(phoneDigits.slice(-7)) ||
            combinedText.includes(phoneDigits.slice(-10)));
        result.phoneMatch = phoneFound;
        if (result.phoneMatch) result.foundPhone = audit.business_phone;
      } else {
        result.phoneMatch = true;
      }

      // Website match: domain name substring.
      if (audit.business_website) {
        const websiteDomain = audit.business_website
          .replace(/https?:\/\/(www\.)?/, '')
          .replace(/\/.*/, '')
          .toLowerCase();
        result.websiteMatch = combinedText.includes(websiteDomain);
        if (result.websiteMatch) result.foundWebsite = audit.business_website;
      } else {
        result.websiteMatch = true;
      }

      break;
    }
  }

  return result;
}

/**
 * Fetch reviews for a Google business via Serper's `/reviews` endpoint.
 * Accepts either a CID (preferred) or a Google placeId.
 */
async function fetchSerperReviews({ cid, placeId, num = 5, userId }) {
  try {
    const effectiveKey = getSystemApiKey('serper');
    if (!effectiveKey) return { reviews: [], error: 'Serper API key not configured.' };

    const payload = {};
    if (cid) payload.cid = String(cid);
    else if (placeId) payload.placeId = String(placeId);
    else return { reviews: [], error: 'No CID or placeId provided.' };

    payload.num = num;
    payload.sortBy = 'most_relevant';

    const fetcher = await ensureFetch();
    const response = await fetcher('https://google.serper.dev/reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': effectiveKey,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { reviews: [], error: 'Invalid JSON from Serper reviews.' };
    }

    if (!response.ok) {
      return {
        reviews: [],
        error: data?.error || data?.message || 'Serper reviews request failed.',
      };
    }

    logApiRequest(userId, 'serper_reviews', data?.credits || 1, { cid: cid || '', num }).catch(
      () => {},
    );

    const normalized = Array.isArray(data?.reviews)
      ? data.reviews.map((r) => ({
          author: r.username || r.user?.name || r.name || '',
          body: r.snippet || r.text || '',
          name: r.title || '',
          ratingValue: r.rating != null ? String(r.rating) : '',
          datePublished: r.date || r.isoDate || '',
          url: r.link || r.url || '',
        }))
      : [];
    return { reviews: normalized };
  } catch (err) {
    logger.warn({ err }, 'fetchSerperReviews failed');
    return { reviews: [], error: err.message || 'Unknown error fetching Serper reviews.' };
  }
}

module.exports = { checkCitationViaSerper, fetchSerperReviews };
