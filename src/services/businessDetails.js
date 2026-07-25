'use strict';

const fsp = require('fs').promises;
const logger = require('../utils/logger');
const { ensureFetch } = require('../utils/smartFetch');
const { getUserGbaHistoryFile } = require('../storage/paths');
const { STOPWORDS } = require('../utils/htmlScrape');
const { extractCidFromMapUrl } = require('./schemaAutofill');
const {
  getUserDataForSeoCredentials,
  performTask,
  ENDPOINTS,
  getGeoTargetsForKey,
  DEFAULT_LOCATION_KEY,
} = require('../integrations/dataforseo');
const { getUserGooglePlacesKey } = require('../integrations/googlePlaces');

// ---- Constants ----
const PLACE_ID_PATTERN = /^ChI[a-zA-Z0-9_-]{20,}$/;
const MAP_URL_LATLNG_REGEX =
  /@(-?\d+\.\d+),(-?\d+\.\d+)(?:[,/]|$)|!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/;

const BUSINESS_DETAILS_CACHE = new Map();
const BUSINESS_DETAILS_TTL_MS = 30 * 60 * 1000;

const PRICE_LEVEL_LABELS = ['Free', 'Inexpensive', 'Moderate', 'Expensive', 'Very Expensive'];

const AMENITY_FLAGS = [
  { key: 'delivery', label: 'Delivery available' },
  { key: 'takeout', label: 'Takeout available' },
  { key: 'dine_in', label: 'Dine-in' },
  { key: 'curbside_pickup', label: 'Curbside pickup' },
  { key: 'reservable', label: 'Takes reservations' },
  { key: 'serves_breakfast', label: 'Serves breakfast' },
  { key: 'serves_lunch', label: 'Serves lunch' },
  { key: 'serves_dinner', label: 'Serves dinner' },
  { key: 'serves_beer', label: 'Serves beer' },
  { key: 'serves_wine', label: 'Serves wine' },
  { key: 'serves_brunch', label: 'Serves brunch' },
  { key: 'serves_vegetarian_food', label: 'Vegetarian-friendly' },
];

// ---- Tiny helpers ----
const sanitizeNumericId = (value, fallback = '') => {
  if (!value) return fallback;
  const cleaned = String(value).replace(/[^0-9-]/g, '').replace(/-/g, '');
  return cleaned || fallback;
};

const humanizeType = (type = '') =>
  type
    .split('_')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');

const describePriceLevel = (level) => {
  if (typeof level !== 'number' || Number.isNaN(level)) return null;
  return PRICE_LEVEL_LABELS[level] || `Tier ${level + 1}`;
};

const normalizeWeekdayText = (weekdayText = []) => {
  if (!Array.isArray(weekdayText) || !weekdayText.length) return {};
  return weekdayText.reduce((acc, line) => {
    if (typeof line !== 'string') return acc;
    const [rawDay, ...rest] = line.split(':');
    if (!rawDay || !rest.length) return acc;
    const key = rawDay.trim().toLowerCase();
    acc[key] = rest.join(':').replace(/\s+/g, ' ').trim();
    return acc;
  }, {});
};

const computeReviewInsights = (reviews = []) => {
  if (!Array.isArray(reviews) || !reviews.length) {
    return { keywords: [], positiveCount: 0, negativeCount: 0, total: 0 };
  }

  const keywordCounts = new Map();
  let positiveCount = 0;
  let negativeCount = 0;

  reviews.forEach((review) => {
    if (!review || typeof review.text !== 'string') return;
    if (typeof review.rating === 'number') {
      if (review.rating >= 4) positiveCount += 1;
      if (review.rating <= 2) negativeCount += 1;
    }

    const normalized = review.text.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ');
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const seen = new Set();
    tokens.forEach((token) => {
      if (token.length < 3) return;
      if (STOPWORDS.has(token)) return;
      if (seen.has(token)) return;
      seen.add(token);
      keywordCounts.set(token, (keywordCounts.get(token) || 0) + 1);
    });
  });

  const keywords = [...keywordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([keyword, count]) => ({ keyword, count }));

  return { keywords, positiveCount, negativeCount, total: reviews.length };
};

// ---- Cache ----
const getCachedBusinessDetails = (placeId) => {
  if (!placeId) return null;
  const cached = BUSINESS_DETAILS_CACHE.get(placeId);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    BUSINESS_DETAILS_CACHE.delete(placeId);
    return null;
  }
  return cached.data;
};

const setCachedBusinessDetails = (placeId, data) => {
  if (!placeId || !data) return;
  BUSINESS_DETAILS_CACHE.set(placeId, {
    data,
    expiresAt: Date.now() + BUSINESS_DETAILS_TTL_MS,
  });
};

// ---- GBA history (per-user file-backed JSON) ----
// Each user has their own `users/<id>/gba-history.json`. Pre-2026-05-27 this
// was a single shared file at the storage root — that was a cross-user leak.

function assertUserId(userId, op) {
  if (userId === undefined || userId === null || userId === '') {
    throw new Error(`GBA history ${op}: userId is required`);
  }
}

const readGbaHistory = async (userId) => {
  assertUserId(userId, 'read');
  try {
    const raw = await fsp.readFile(getUserGbaHistoryFile(userId), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    logger.error({ err: error, userId }, 'Failed to read GBA history');
    return [];
  }
};

const writeGbaHistory = async (userId, items = []) => {
  assertUserId(userId, 'write');
  try {
    const safe = Array.isArray(items) ? items : [];
    await fsp.writeFile(
      getUserGbaHistoryFile(userId),
      JSON.stringify(safe, null, 2),
      'utf8',
    );
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to write GBA history');
  }
};

const saveGbaHistoryItem = async (userId, record = {}) => {
  assertUserId(userId, 'save');
  const existing = await readGbaHistory(userId);
  const sanitized = {
    id: record.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: record.title || 'Unknown business',
    placeId: record.placeId || null,
    cid: record.cid || null,
    rating: typeof record.rating === 'number' ? record.rating : null,
    reviewCount: typeof record.reviewCount === 'number' ? record.reviewCount : 0,
    auditAt: record.auditAt || new Date().toISOString(),
    data: record.data || null,
  };
  const next = existing.filter((item) => {
    if (sanitized.placeId && item.placeId === sanitized.placeId) return false;
    if (sanitized.cid && item.cid === sanitized.cid) return false;
    return true;
  });
  next.unshift(sanitized);
  await writeGbaHistory(userId, next.slice(0, 100));
  return sanitized;
};

// ---- Maps URL parsers / important links builder ----
const parseMapsUrlMetadata = (raw) => {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const url = new URL(raw);
    const segments = url.pathname.split('/').filter(Boolean);
    const placeIndex = segments.findIndex((segment) => segment.toLowerCase() === 'place');
    const slug =
      placeIndex !== -1 && segments[placeIndex + 1]
        ? decodeURIComponent(segments[placeIndex + 1])
        : null;

    const latLngMatch =
      url.pathname.match(MAP_URL_LATLNG_REGEX) || url.href.match(MAP_URL_LATLNG_REGEX);
    let lat = null;
    let lng = null;
    if (latLngMatch) {
      lat = parseFloat(latLngMatch[1] || latLngMatch[3]);
      lng = parseFloat(latLngMatch[2] || latLngMatch[4]);
    }

    return { slug, lat, lng };
  } catch {
    return {};
  }
};

const buildImportantLinks = (details = {}) => {
  const links = [];
  const { placeId, mapsUrl, address, website, phone, kgmid, cid, name } = details;
  const seen = new Set();
  const addLink = (label, description, url, icon) => {
    if (!url || seen.has(url)) return;
    links.push({ label, description, url, icon });
    seen.add(url);
  };

  const sanitizedPhone =
    typeof phone === 'string'
      ? phone.replace(/[^\d+]/g, '').replace(/^\+{2,}/, '+')
      : '';
  const encodedAddress = address ? encodeURIComponent(address) : '';
  let websiteDomain = '';
  if (website) {
    try {
      const url = new URL(website);
      websiteDomain = url.hostname.replace(/^www\./i, '');
    } catch {
      websiteDomain = '';
    }
  }

  addLink(
    'Review list display link',
    'Jump straight to every Google review.',
    placeId ? `https://search.google.com/local/reviews?placeid=${placeId}` : null,
    '⭐',
  );
  addLink(
    'Review request link',
    'Shareable link that opens the "Write a review" dialog.',
    placeId ? `https://search.google.com/local/writereview?placeid=${placeId}` : null,
    '👍',
  );
  addLink(
    'Knowledge Panel page link',
    'Full knowledge panel experience inside Google Search.',
    kgmid ? `https://www.google.com/search?kgmid=${kgmid}` : null,
    '🧠',
  );
  addLink(
    'GMB Post URL',
    'Latest Google Posts/Updates surfaced from the knowledge panel.',
    kgmid ? `https://www.google.com/search?kgmid=${kgmid}&uact=5#lpstate=pid:-1` : null,
    '📘',
  );
  addLink(
    'Ask question request URL',
    'Let prospects submit a fresh Q&A entry.',
    kgmid ? `https://www.google.com/search?kgmid=${kgmid}&uact=5#lpqa=a,,d,1` : null,
    '🙋',
  );
  addLink(
    'Questions and answers URL',
    'Existing Q&A thread for this listing.',
    kgmid ? `https://www.google.com/search?kgmid=${kgmid}&uact=5#lpqa=d,2` : null,
    '☁️',
  );
  addLink(
    'Products',
    'Google-curated product feed inside the knowledge panel.',
    kgmid ? `https://www.google.com/search?kgmid=${kgmid}#lpc=lpc` : null,
    '🛒',
  );
  addLink(
    'Services',
    'Local services profile for this brand.',
    name || address
      ? `https://www.google.com/localservices/prolist?src=2&q=${encodeURIComponent(
          [name, address].filter(Boolean).join(' '),
        )}`
      : null,
    '💼',
  );
  addLink(
    "Other GMB's at same address",
    'See every business claimed at this exact address.',
    encodedAddress ? `https://www.google.com/maps/place/${encodedAddress}` : null,
    '📇',
  );
  addLink(
    "GMB's with same website domain",
    'Hunt for duplicate listings sharing this domain.',
    websiteDomain
      ? `https://www.google.com/search?q=%22${encodeURIComponent(websiteDomain)}%22&tbm=lcl`
      : null,
    '💻',
  );
  addLink(
    'GMB link with Place ID',
    'Deep link anchored to this Place ID.',
    placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : null,
    '⛓️',
  );
  addLink(
    'GMB link with CID',
    'CID-based Google Maps link.',
    cid ? `https://www.google.com/maps/place/?cid=${cid}` : null,
    '🏹',
  );
  addLink(
    'Call business',
    'Click-to-call link for the main phone number.',
    sanitizedPhone ? `tel:${sanitizedPhone}` : null,
    '📞',
  );

  return links;
};

// ---- DataForSEO business-info transform ----
const formatHourMinute = (entry = {}) => {
  if (!entry || typeof entry.hour !== 'number') return null;
  const hours24 = entry.hour;
  const minutes = typeof entry.minute === 'number' ? entry.minute : 0;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const normalized = hours24 % 12 || 12;
  return `${normalized}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

const buildWeekdayTextFromTimetable = (timetable = {}) => {
  if (!timetable || typeof timetable !== 'object') return [];
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return days.reduce((acc, day) => {
    const slots = timetable[day];
    if (typeof slots === 'undefined') return acc;
    const label = day.charAt(0).toUpperCase() + day.slice(1);
    let display = 'Closed';
    if (Array.isArray(slots) && slots.length) {
      const ranges = slots
        .map((slot) => {
          if (typeof slot === 'string') return slot;
          if (!slot || typeof slot !== 'object') return null;
          const open = slot.open || slot.from;
          const close = slot.close || slot.to;
          const openLabel = typeof open === 'string' ? open : formatHourMinute(open);
          const closeLabel = typeof close === 'string' ? close : formatHourMinute(close);
          const openFallback = typeof slot.open_time === 'string' ? slot.open_time : null;
          const closeFallback = typeof slot.close_time === 'string' ? slot.close_time : null;
          const parts = [openLabel || openFallback, closeLabel || closeFallback].filter(Boolean);
          if (parts.length === 0) return null;
          if (parts.length === 1) return parts[0];
          return `${parts[0]} – ${parts[1]}`;
        })
        .filter(Boolean);
      if (ranges.length) display = ranges.join(', ');
    } else if (slots && typeof slots === 'object') {
      const openLabel = formatHourMinute(slots.open || slots.from) || slots.open_time || null;
      const closeLabel = formatHourMinute(slots.close || slots.to) || slots.close_time || null;
      const parts = [openLabel, closeLabel].filter(Boolean);
      display = parts.length ? parts.join(' – ') : display;
    } else if (typeof slots === 'string') {
      display = slots;
    }
    acc.push(`${label}: ${display}`);
    return acc;
  }, []);
};

const flattenDataForSeoAttributes = (attributes = {}) => {
  const labels = [];
  const groups = attributes.available_attributes || attributes;
  Object.entries(groups || {}).forEach(([, values]) => {
    if (Array.isArray(values)) {
      values.forEach((value) => {
        if (typeof value === 'string' && value.trim()) labels.push(humanizeType(value.trim()));
      });
    } else if (typeof values === 'string' && values.trim()) {
      labels.push(humanizeType(values.trim()));
    }
  });
  return [...new Set(labels)];
};

const minutesSinceMidnight = (date) => date.getHours() * 60 + date.getMinutes();

const computeBusinessStatus = (timetable = {}, statusRaw = '') => {
  const normalizedStatus = String(statusRaw || '').toLowerCase();
  if (normalizedStatus.includes('closed')) return 'Closed';
  if (normalizedStatus.includes('open')) return 'Open';

  if (!timetable || typeof timetable !== 'object') return 'Open';
  const now = new Date();
  const dayIndex = now.getDay();
  const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayKey = dayMap[dayIndex];
  const slots = timetable[todayKey];
  if (!slots || !Array.isArray(slots)) return 'Open';

  const currentMinutes = minutesSinceMidnight(now);
  const soonThreshold = 60;
  for (const slot of slots) {
    const open = slot?.open || slot?.from;
    const close = slot?.close || slot?.to;
    if (!open || !close || typeof open.hour !== 'number' || typeof close.hour !== 'number') {
      continue;
    }
    const openMinutes = minutesSinceMidnight(
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), open.hour, open.minute || 0),
    );
    const closeMinutes = minutesSinceMidnight(
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), close.hour, close.minute || 0),
    );

    if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
      if (closeMinutes - currentMinutes <= soonThreshold) return 'Closes Soon';
      return 'Open';
    }
    if (openMinutes - currentMinutes > 0 && openMinutes - currentMinutes <= soonThreshold) {
      return 'Opens Soon';
    }
  }

  return 'Closed';
};

const normalizePriceLevelValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (['free', '$', '0'].includes(normalized)) return 0;
    if (['inexpensive', 'cheap', 'low', '$$'].includes(normalized)) return 1;
    if (['moderate', 'medium', '$$$'].includes(normalized)) return 2;
    if (['expensive', 'high', '$$$$'].includes(normalized)) return 3;
    if (['very expensive', 'very_expensive', 'luxury', '$$$$$'].includes(normalized)) return 4;
  }
  return null;
};

const transformDataForSeoBusinessItem = (item = {}, meta = {}) => {
  const categories = [item.category].filter(Boolean);
  if (Array.isArray(item.additional_categories)) categories.push(...item.additional_categories);
  const rawCategories = [
    ...(Array.isArray(item.category_ids) ? item.category_ids : []),
    ...(Array.isArray(item.additional_categories) ? item.additional_categories : []),
  ].filter(Boolean);

  const address = item.address || item.snippet || '';
  const addressLines = address ? address.split(',').map((line) => line.trim()).filter(Boolean) : [];
  const openingHoursText = buildWeekdayTextFromTimetable(item.work_time?.work_hours?.timetable);
  const hoursByDay = normalizeWeekdayText(openingHoursText);
  const priceLevelValue = normalizePriceLevelValue(item.price_level);
  const ratingValue = typeof item.rating?.value === 'number' ? item.rating.value : null;
  const ratingVotes = typeof item.rating?.votes_count === 'number' ? item.rating.votes_count : 0;
  const statusRaw =
    item.work_time?.work_hours?.current_status || item.work_time?.current_status || '';
  const statusHuman = computeBusinessStatus(item.work_time?.work_hours?.timetable, statusRaw);
  const amenities = flattenDataForSeoAttributes(item.attributes || {});
  const reviews = Array.isArray(item.reviews) ? item.reviews : [];
  const photos = [];
  if (item.main_image) photos.push({ reference: null, url: item.main_image });
  if (item.logo) photos.push({ reference: null, url: item.logo });
  if (Array.isArray(item.images)) {
    item.images.forEach((img) => {
      if (typeof img === 'string' && img.trim()) {
        photos.push({ reference: null, url: img.trim() });
      } else if (img && typeof img.url === 'string') {
        photos.push({ reference: null, url: img.url });
      }
    });
  }

  const coordinates =
    typeof item.latitude === 'number' && typeof item.longitude === 'number'
      ? { lat: item.latitude, lng: item.longitude }
      : null;

  const addressComponents = [];
  const info = item.address_info || {};
  if (info.borough) {
    addressComponents.push({
      long_name: info.borough,
      short_name: info.borough,
      types: ['sublocality', 'political'],
    });
  }
  if (info.address) {
    addressComponents.push({ long_name: info.address, short_name: info.address, types: ['route'] });
  }
  if (info.city) {
    addressComponents.push({
      long_name: info.city,
      short_name: info.city,
      types: ['locality', 'political'],
    });
  }
  if (info.region) {
    addressComponents.push({
      long_name: info.region,
      short_name: info.region,
      types: ['administrative_area_level_1', 'political'],
    });
  }
  if (info.zip) {
    addressComponents.push({ long_name: info.zip, short_name: info.zip, types: ['postal_code'] });
  }
  if (info.country_code) {
    addressComponents.push({
      long_name: info.country_code,
      short_name: info.country_code,
      types: ['country', 'political'],
    });
  }

  const normalizedWebsite =
    item.url || item.contact_url || (item.domain ? `https://${item.domain}` : '');
  const importantLinks = buildImportantLinks({
    placeId: item.place_id || meta.placeId || null,
    mapsUrl: item.check_url || meta.mapUrl || '',
    name: item.title,
    address,
    website: normalizedWebsite,
    phone: item.phone,
    kgmid: meta.kgmid || null,
    cid: item.cid || meta.cid || null,
  });

  const knowledgePanelId = item.feature_id || null;

  return {
    placeId: item.place_id || meta.placeId || null,
    name: item.title || item.name || '',
    address,
    addressLines,
    phone: item.phone || '',
    internationalPhone: item.phone || '',
    website: normalizedWebsite,
    mapsUrl: item.check_url || meta.mapUrl || '',
    rating: ratingValue,
    userRatingsTotal: ratingVotes,
    priceLevel: priceLevelValue,
    priceLevelLabel:
      typeof item.price_level === 'string' && priceLevelValue === null
        ? humanizeType(item.price_level)
        : describePriceLevel(priceLevelValue),
    categories: [...new Set(categories.filter(Boolean))],
    rawCategories,
    businessStatus: statusHuman,
    editorSummary: item.description || item.snippet || '',
    coordinates,
    openingHours: item.work_time || null,
    openingHoursText,
    hoursByDay,
    isOpenNow: String(statusRaw || '').toLowerCase() === 'open',
    currentOpeningHours: item.work_time || null,
    secondaryOpeningHours: null,
    amenities,
    reviewSnippets: [],
    reviews,
    reviewInsights: computeReviewInsights(reviews),
    photos,
    importantLinks,
    kgmid: meta.kgmid || knowledgePanelId || null,
    knowledgePanelId,
    cid: item.cid || meta.cid || null,
    plusCode: null,
    addressComponents,
    fetchedAt: new Date().toISOString(),
    cached: false,
    dataSource: 'dataforseo',
    ratingDistribution: item.rating_distribution || null,
    workTime: item.work_time || null,
    peopleAlsoSearch: item.people_also_search || null,
    placeTopics: item.place_topics || null,
    businessProfileId: item.feature_id || null,
  };
};

const extractDataForSeoBusinessItem = (task = {}) => {
  const results = Array.isArray(task.result) ? task.result : [];
  for (const result of results) {
    const items = Array.isArray(result.items) ? result.items : [];
    if (!items.length) continue;
    const item = items.find((entry) => entry.type === 'google_business_info') || items[0];
    if (item) return { item, context: result };
  }
  return { item: null, context: null };
};

/**
 * Look up business details via DataForSEO's Google Business Info endpoint, then
 * optionally enrich with Google Places photos/coords if the caller has a key.
 * Result is cached for BUSINESS_DETAILS_TTL_MS (30 min) per cache key
 * (place_id > CID > primary keyword).
 */
const fetchBusinessDetailsDataForSeo = async ({
  userId,
  rawInput,
  mapUrl,
  cid,
  forceRefresh = false,
}) => {
  const normalizedInput = typeof rawInput === 'string' ? rawInput.trim() : '';
  const normalizedPlaceId = PLACE_ID_PATTERN.test(normalizedInput) ? normalizedInput : '';
  const providedCid = sanitizeNumericId(cid);
  const mapCid = extractCidFromMapUrl(mapUrl);
  const derivedCid = sanitizeNumericId(providedCid || mapCid || '');
  const slug = parseMapsUrlMetadata(mapUrl || normalizedInput).slug || '';
  const keywords = [];
  const addKeyword = (value) => {
    const candidate = typeof value === 'string' ? value.trim() : '';
    if (candidate && !keywords.includes(candidate)) keywords.push(candidate);
  };
  if (derivedCid) addKeyword(`cid:${derivedCid}`);
  if (normalizedPlaceId) addKeyword(`place_id:${normalizedPlaceId}`);
  addKeyword(slug);
  addKeyword(normalizedInput);
  addKeyword(mapUrl);

  const primaryKeyword = keywords.find(Boolean);
  if (!primaryKeyword) {
    const err = new Error('Provide a Google Maps URL, place ID, or CID to audit.');
    err.status = 400;
    throw err;
  }

  const cacheKey = normalizedPlaceId || derivedCid || primaryKeyword;
  if (!forceRefresh) {
    const cached = getCachedBusinessDetails(cacheKey);
    if (cached) return { ...cached, cached: true };
  }

  const creds = await getUserDataForSeoCredentials(userId);
  if (!creds.login || !creds.password) {
    const err = new Error(
      'DataForSEO credentials are missing. Update them in Settings → Saved APIs.',
    );
    err.status = 400;
    throw err;
  }

  const locationSettings = getGeoTargetsForKey(DEFAULT_LOCATION_KEY);
  const basePayload = {
    location_code: locationSettings.location_code,
    language_code: locationSettings.language_code,
    se: 'google',
    se_type: 'business_info',
    device: 'desktop',
    os: 'windows',
  };

  let lastError = null;
  for (const keyword of keywords) {
    if (!keyword) continue;
    try {
      const task = await performTask(
        ENDPOINTS.BUSINESS_INFO,
        [{ ...basePayload, keyword }],
        creds,
      );
      const { item, context } = extractDataForSeoBusinessItem(task);
      if (!item) {
        lastError = new Error('No business data returned from DataForSEO.');
        continue;
      }
      const business = transformDataForSeoBusinessItem(item, {
        mapUrl: context?.check_url || mapUrl || normalizedInput,
        cid: derivedCid || item.cid || null,
        placeId: normalizedPlaceId || item.place_id || null,
      });

      try {
        const googlePlacesKey = await getUserGooglePlacesKey(userId);
        if (googlePlacesKey && business.placeId) {
          const fetcher = await ensureFetch();
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
            business.placeId,
          )}&fields=photos,geometry,url&key=${googlePlacesKey}`;
          const resp = await fetcher(detailsUrl);
          if (resp.ok) {
            const gData = await resp.json();
            if (gData.status === 'OK' && gData.result) {
              const photos = Array.isArray(gData.result.photos)
                ? gData.result.photos.map((p, idx) => ({
                    reference: p.photo_reference,
                    width: p.width,
                    height: p.height,
                    htmlAttributions: p.html_attributions || [],
                    key: p.photo_reference || `g-${idx}`,
                  }))
                : [];
              if (photos.length) {
                const combined = [...photos, ...(business.photos || [])];
                const seen = new Set();
                business.photos = combined.filter((p) => {
                  const key = p.reference || p.url || p.key;
                  if (!key || seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
              }
              if (!business.coordinates && gData.result.geometry?.location) {
                business.coordinates = gData.result.geometry.location;
              }
              if (!business.mapsUrl && gData.result.url) {
                business.mapsUrl = gData.result.url;
              }
            }
          }
        }
      } catch (enrichError) {
        logger.warn({ err: enrichError }, 'Google Places photo enrichment failed');
      }

      setCachedBusinessDetails(cacheKey, business);
      return { ...business, cached: false };
    } catch (error) {
      lastError = error;
    }
  }

  const finalError = lastError || new Error('Failed to fetch business details from DataForSEO.');
  finalError.status = finalError.status || finalError.httpStatus || 502;
  throw finalError;
};

module.exports = {
  // Constants
  PLACE_ID_PATTERN,
  MAP_URL_LATLNG_REGEX,
  AMENITY_FLAGS,
  // Small helpers (some still imported elsewhere)
  sanitizeNumericId,
  humanizeType,
  describePriceLevel,
  normalizeWeekdayText,
  computeReviewInsights,
  // Map URL + important links
  parseMapsUrlMetadata,
  buildImportantLinks,
  // DataForSEO transforms
  transformDataForSeoBusinessItem,
  extractDataForSeoBusinessItem,
  flattenDataForSeoAttributes,
  buildWeekdayTextFromTimetable,
  computeBusinessStatus,
  normalizePriceLevelValue,
  // Cache
  getCachedBusinessDetails,
  setCachedBusinessDetails,
  // History
  readGbaHistory,
  writeGbaHistory,
  saveGbaHistoryItem,
  // Main lookup
  fetchBusinessDetailsDataForSeo,
};
