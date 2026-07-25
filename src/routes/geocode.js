'use strict';

const express = require('express');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { ensureFetch } = require('../integrations/claude'); // shared fetch loader

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  const { q } = req.query;
  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return res.status(400).json({ error: 'Query parameter "q" is required (min 2 characters)' });
  }

  try {
    const fetcher = await ensureFetch();
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      q.trim(),
    )}&limit=5`;

    const response = await fetcher(url, {
      headers: {
        'User-Agent': 'SEOToolkit/1.0',
        Accept: 'application/json',
      },
      timeout: 10000,
    });

    if (!response.ok) throw new Error(`Nominatim API returned ${response.status}`);
    const data = await response.json();

    res.json({
      success: true,
      results: (data || []).map((item) => ({
        displayName: item.display_name,
        lat: item.lat,
        lng: item.lon,
        type: item.type,
        importance: item.importance,
      })),
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Geocode error');
    res.status(500).json({ error: 'Failed to geocode address', details: err.message });
  }
});

module.exports = router;
