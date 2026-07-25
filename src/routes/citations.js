'use strict';

const express = require('express');
const logger = require('../utils/logger');
const { dbGet, dbAll, dbRun } = require('../utils/dbAsync');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
router.use(authenticate);

// Reabsorbed from the (now-deleted) citations microservice. Talks directly
// to the same SQLite database as the rest of the app.

function generateEntityId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique 4-digit business ID slug.
 */
async function generateBusinessIdSlug() {
  const rows = await dbAll(
    'SELECT business_id_slug FROM business_entities WHERE business_id_slug IS NOT NULL',
  );
  const used = new Set(rows.map((r) => r.business_id_slug));
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const slug = Math.floor(1000 + Math.random() * 9000).toString();
    if (!used.has(slug)) return slug;
  }
  return null;
}

function calculateProfileHealth(entity) {
  const required = [
    'name', 'phone', 'email', 'country', 'city', 'address', 'zipcode',
    'state', 'website', 'working_hours', 'categories', 'description',
  ];
  const optional = [
    'year_established', 'services', 'keywords', 'logo_url', 'photos',
    'associations', 'social_profiles',
  ];
  let completed = 0;
  const total = required.length + optional.length * 0.5;

  required.forEach((field) => {
    if (field === 'working_hours') {
      if (entity.working_hours && JSON.parse(entity.working_hours || '{}')) completed += 1;
    } else if (field === 'categories') {
      if (entity.categories && JSON.parse(entity.categories || '[]').length > 0) completed += 1;
    } else if (field === 'social_profiles') {
      if (entity.social_profiles && JSON.parse(entity.social_profiles || '{}')) {
        const profiles = JSON.parse(entity.social_profiles);
        if (profiles.facebook || profiles.google || profiles.instagram) completed += 1;
      }
    } else if (entity[field]) {
      completed += 1;
    }
  });

  optional.forEach((field) => {
    if (entity[field] && field !== 'social_profiles') completed += 0.5;
  });

  return Math.round((completed / total) * 100);
}

function mapEntity(row, userId) {
  return {
    _id: row.id.toString(),
    entityId: row.entity_id,
    businessIdSlug: row.business_id_slug || null,
    entityType: 'location',
    locationId: userId ? userId.toString() : undefined,
    name: row.name,
    phone: row.phone,
    address: row.address,
    city: row.city,
    state: row.state,
    zipcode: row.zipcode,
    country: row.country || 'US',
    email: row.email,
    website: row.website,
    description: row.description,
    yearEstablished: row.year_established,
    categories: row.categories ? JSON.parse(row.categories) : [],
    services: row.services ? JSON.parse(row.services) : [],
    keywords: row.keywords ? JSON.parse(row.keywords) : [],
    workingHours: row.working_hours ? JSON.parse(row.working_hours) : {},
    socialProfiles: row.social_profiles ? JSON.parse(row.social_profiles) : {},
    logo: {
      url: row.logo_url || false,
      description: row.logo_description || false,
    },
    photos: row.photos ? JSON.parse(row.photos) : [],
    featuredMessage: row.featured_message ? JSON.parse(row.featured_message) : {},
    status: row.status || 'COMPLETE',
    provider: row.provider || 'INTERNAL',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    listingsCreatedOn: row.listings_created_at,
  };
}

// ---- Entities ----
router.get('/entities', async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await dbAll(
      'SELECT * FROM business_entities WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
    );

    // Backfill business_id_slug for rows that don't have one.
    for (const row of rows) {
      if (!row.business_id_slug) {
        // eslint-disable-next-line no-await-in-loop
        const slug = await generateBusinessIdSlug();
        if (slug) {
          // eslint-disable-next-line no-await-in-loop
          await dbRun('UPDATE business_entities SET business_id_slug = ? WHERE id = ?', [
            slug,
            row.id,
          ]);
          row.business_id_slug = slug;
        }
      }
    }

    res.json(rows.map((r) => mapEntity(r, userId)));
  } catch (err) {
    logger.error({ err }, 'Get entities error');
    res.status(500).json({ error: 'Failed to fetch entities' });
  }
});

router.get('/entities/:entityId', async (req, res) => {
  try {
    const row = await dbGet(
      'SELECT * FROM business_entities WHERE entity_id = ? AND user_id = ?',
      [req.params.entityId, req.user.id],
    );
    if (!row) return res.status(404).json({ error: 'Entity not found' });

    if (!row.business_id_slug) {
      const slug = await generateBusinessIdSlug();
      if (slug) {
        await dbRun('UPDATE business_entities SET business_id_slug = ? WHERE entity_id = ?', [
          slug,
          row.entity_id,
        ]);
        row.business_id_slug = slug;
      }
    }
    res.json(mapEntity(row, req.user.id));
  } catch (err) {
    logger.error({ err }, 'Get entity error');
    res.status(500).json({ error: 'Failed to fetch entity' });
  }
});

router.post('/entities', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      entityId,
      name,
      phone,
      address,
      city,
      state,
      zipcode,
      country = 'US',
      email,
      website,
      description,
      yearEstablished,
      categories = [],
      services = [],
      keywords = [],
      workingHours = {},
      socialProfiles = {},
      logoUrl,
      logoDescription,
      photos = [],
      featuredMessage = {},
    } = req.body;

    const finalEntityId = entityId || generateEntityId();

    const existing = await dbGet(
      'SELECT id, business_id_slug FROM business_entities WHERE entity_id = ? AND user_id = ?',
      [finalEntityId, userId],
    );

    const entityData = {
      name,
      phone,
      address,
      city,
      state,
      zipcode,
      country,
      email,
      website,
      description,
      year_established: yearEstablished,
      categories: JSON.stringify(categories),
      services: JSON.stringify(services),
      keywords: JSON.stringify(keywords),
      working_hours: JSON.stringify(workingHours),
      social_profiles: JSON.stringify(socialProfiles),
      logo_url: logoUrl,
      logo_description: logoDescription,
      photos: JSON.stringify(photos),
      featured_message: JSON.stringify(featuredMessage),
      status: 'COMPLETE',
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const updateFields = Object.keys(entityData).map((k) => `${k} = ?`).join(', ');
      const values = [...Object.values(entityData), finalEntityId, userId];
      await dbRun(
        `UPDATE business_entities SET ${updateFields} WHERE entity_id = ? AND user_id = ?`,
        values,
      );
      return res.json({
        entityId: finalEntityId,
        businessIdSlug: existing.business_id_slug,
        message: 'Entity updated successfully',
      });
    }

    const businessIdSlug = await generateBusinessIdSlug();
    if (!businessIdSlug) {
      return res.status(500).json({ error: 'Failed to generate unique business ID slug' });
    }
    const fields = ['user_id', 'entity_id', 'business_id_slug', ...Object.keys(entityData)];
    const placeholders = fields.map(() => '?').join(', ');
    const values = [userId, finalEntityId, businessIdSlug, ...Object.values(entityData)];
    await dbRun(
      `INSERT INTO business_entities (${fields.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    res.json({ entityId: finalEntityId, businessIdSlug, message: 'Entity created successfully' });
  } catch (err) {
    logger.error({ err }, 'Create/update entity error');
    res.status(500).json({ error: 'Failed to create/update entity' });
  }
});

// ---- Listings ----
router.get('/listings/:entityId', async (req, res) => {
  try {
    const entity = await dbGet(
      'SELECT id FROM business_entities WHERE entity_id = ? AND user_id = ?',
      [req.params.entityId, req.user.id],
    );
    if (!entity) return res.status(404).json({ error: 'Entity not found' });

    const listings = await dbAll(
      'SELECT * FROM listings WHERE entity_id = ? ORDER BY publisher_id ASC',
      [req.params.entityId],
    );
    res.json({
      listings: listings.map((l) => ({
        publisherId: l.publisher_id,
        listingUrl: l.listing_url,
        status: l.status || 'LIVE',
        statusDetails: l.status_details ? JSON.parse(l.status_details) : [],
      })),
      count: listings.length,
    });
  } catch (err) {
    logger.error({ err }, 'Get listings error');
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// Sync placeholder — listings sync is audit-only mode in this codebase.
router.post('/listings/:entityId/sync', async (req, res) => {
  res.status(202).json({ status: 'queued' });
});

// ---- Profile health ----
router.get('/profile-health/:entityId', async (req, res) => {
  try {
    const row = await dbGet(
      'SELECT * FROM business_entities WHERE entity_id = ? AND user_id = ?',
      [req.params.entityId, req.user.id],
    );
    if (!row) return res.status(404).json({ error: 'Entity not found' });

    const socialProfiles = row.social_profiles ? JSON.parse(row.social_profiles) : {};
    const missingFields = {
      name: !row.name,
      phone: !row.phone,
      email: !row.email,
      country: !row.country,
      city: !row.city,
      address: !row.address,
      zipcode: !row.zipcode,
      state: !row.state,
      website: !row.website,
      workingHours: !row.working_hours || !JSON.parse(row.working_hours || '{}'),
      holidays: true,
      categories: !row.categories || !JSON.parse(row.categories || '[]').length,
      description: !row.description,
      yearEstablished: !row.year_established,
      services: !row.services || !JSON.parse(row.services || '[]').length,
      associations: true,
      brands: true,
      languages: true,
      keywords: !row.keywords || !JSON.parse(row.keywords || '[]').length,
      logoUrl: !row.logo_url,
      logoDescription: !row.logo_description,
      photos: !row.photos || !JSON.parse(row.photos || '[]').length,
      paymentOptions: true,
      featuredMessage: !row.featured_message || !JSON.parse(row.featured_message || '{}').description,
      x: !socialProfiles.x,
      instagram: !socialProfiles.instagram,
      linkedin: !socialProfiles.linkedin,
      facebook: !socialProfiles.facebook,
      pinterest: !socialProfiles.pinterest,
      tiktok: !socialProfiles.tiktok,
      youtube: !socialProfiles.youtube,
      facebookPublisher: true,
      googleMyBusinessPublisher: true,
    };

    res.json({
      [req.params.entityId]: {
        completed: calculateProfileHealth(row),
        missingFields,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Profile health error');
    res.status(500).json({ error: 'Failed to calculate profile health' });
  }
});

// ---- Publishers list ----
const CITATION_PUBLISHERS = [
  '8COUPONS', 'ALEXA', 'AMERICANEXPRESS', 'APPLE', 'AROUNDME', 'BETTERBUSINESSBUREAU',
  'BING', 'BRAVE', 'BROWNBOOKNET', 'CENTRALINDEXUS', 'CHAMBEROFCOMMERCECOM',
  'CITYSEARCH', 'CITYSQUARES', 'CYLEX', 'DEXKNOWS', 'DUNANDBRADSTREET', 'ELOCAL',
  'EZLOCAL', 'FACEBOOK', 'FIND_OPEN', 'FOURSQUARE', 'GEMINI', 'GOLOCAL247',
  'GOOGLEMYBUSINESS', 'HERE', 'HOTFROG', 'HOURSCOM', 'IBEGIN', 'IGLOBAL',
  'INSIDERPAGESV2', 'INSTACART', 'INSTAGRAM', 'MAPBOX', 'MAPQUEST', 'MAPSTR',
  'MERCHANTCIRCLE', 'METAPLACESGRAPH', 'MONEYMAILER', 'MYLOCALSERVICES', 'N49CA',
  'NAVMII', 'NEXTDOOR', 'OPENAI', 'OPENDI', 'PITNEYBOWES', 'POSTMATES',
  'PROPERTYCAPSULE', 'REXDIRECT', 'SAFEGRAPH', 'SHOWMELOCAL', 'SIRI', 'SNAPCHAT',
  'SOLEO', 'SPALOCAL', 'SUPERPAGES', 'TELLOWS', 'TIKTOK', 'TOMTOM', 'TUPALO',
  'UBER', 'UBEREATS', 'UBER_FREIGHT', 'USCITYNET', 'WAZE', 'WHERETO',
  'WOGIBTSWASDE', 'YAHOO', 'YANDEX', 'YELLOWPAGESGOESGREEN', 'YELP', 'YPCOM',
  'ZIPLOCALONLINE',
];

router.get('/list', (req, res) => {
  res.json({ publishers: CITATION_PUBLISHERS, count: CITATION_PUBLISHERS.length });
});

// ---- Fetch business details from Google Maps URL ----
// Used by the citation-audit "import from map link" flow.
const { ensureFetch } = require('../utils/smartFetch');
const { readUserSettingsFromDisk } = require('../storage/userSettings');
const { decryptSecret } = require('../utils/crypto');

async function resolveGooglePlacesKey(userId) {
  const row = await dbGet(
    `SELECT setting_value FROM user_settings
     WHERE user_id = ? AND setting_key = 'googlePlaces_api_key'`,
    [userId],
  );
  if (row?.setting_value) {
    const decrypted = decryptSecret(row.setting_value);
    if (decrypted) return decrypted;
  }
  const disk = readUserSettingsFromDisk(userId);
  return disk?.apiKeys?.googlePlaces || '';
}

router.post('/fetch-from-map', async (req, res) => {
  try {
    const { mapLink } = req.body || {};
    if (!mapLink) return res.status(400).json({ error: 'Map link is required' });

    let placeId = null;

    // Try ?place_id=… first — most reliable.
    const placeIdParamMatch = mapLink.match(/[?&]place_id=([^&]+)/);
    if (placeIdParamMatch) placeId = decodeURIComponent(placeIdParamMatch[1]);

    const apiKey = await resolveGooglePlacesKey(req.user.id);

    // Fall back to reverse-geocoding @lat,lng coordinates.
    if (!placeId) {
      const locationMatch = mapLink.match(/[@]([\d.-]+),([\d.-]+)/);
      if (locationMatch && apiKey) {
        const [, lat, lng] = locationMatch;
        const fetcher = await ensureFetch();
        const geoResponse = await fetcher(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`,
        );
        const geoData = await geoResponse.json();
        if (geoData.status === 'OK' && geoData.results.length > 0) {
          placeId = geoData.results[0].place_id;
        }
      }
    }

    if (!placeId) {
      return res.status(400).json({
        error:
          'Could not extract place information from map link. Please use a Google Maps link with place_id or coordinates.',
      });
    }
    if (!apiKey) {
      return res.status(400).json({
        error: 'Google Places API key not configured. Please add it in Settings > Saved APIs.',
      });
    }

    const fetcher = await ensureFetch();
    const response = await fetcher(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}` +
        `&fields=name,formatted_address,formatted_phone_number,website,address_components,geometry&key=${apiKey}`,
    );
    const data = await response.json();
    if (data.status !== 'OK' || !data.result) {
      return res.status(400).json({ error: 'Failed to fetch business details from Google Maps' });
    }

    const result = data.result;
    let city = '';
    let state = '';
    let zipcode = '';
    let country = 'US';
    (result.address_components || []).forEach((component) => {
      const types = component.types;
      if (types.includes('locality')) city = component.long_name;
      if (types.includes('administrative_area_level_1')) state = component.short_name;
      if (types.includes('postal_code')) zipcode = component.long_name;
      if (types.includes('country')) {
        country = component.short_name === 'United States' ? 'US' : component.short_name;
      }
    });

    let address = result.formatted_address || '';
    if (city && state) {
      address = address.replace(`, ${city}, ${state}`, '').replace(`, ${state}`, '');
      if (zipcode) address = address.replace(` ${zipcode}`, '').replace(`, ${zipcode}`, '');
    }

    res.json({
      name: result.name || '',
      phone: result.formatted_phone_number || '',
      address: address.trim(),
      city,
      state,
      zipcode,
      country,
      website: result.website || '',
      description: '',
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching from map');
    res.status(500).json({ error: 'Failed to fetch business details' });
  }
});

module.exports = router;
