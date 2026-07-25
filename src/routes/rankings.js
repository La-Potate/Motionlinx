'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const { tieredRateLimit } = require('../middleware/rateLimits');
const { db } = require('../utils/dbAsync');
const logger = require('../utils/logger');
const { refreshKeywordPosition } = require('../services/rankings');

const router = express.Router();
const heavyLimit = tieredRateLimit('heavy');

// All /api/rankings/* routes. Mounted at /api (not /api/rankings) so the
// router co-exists with other routers that also straddle /api. authenticate is
// attached per route so the router doesn't intercept unrelated /api/* traffic.

router.get('/rankings/businesses', authenticate, (req, res) => {
  const userId = req.user.id;
  
  db.all(`
    SELECT b.*, 
           COUNT(DISTINCT k.id) as keyword_count,
           SUM(CASE WHEN k.status = 'tracked' THEN 1 ELSE 0 END) as tracked_keywords,
           AVG(CASE WHEN k.last_position IS NOT NULL THEN k.last_position END) as average_position,
           MIN(CASE WHEN k.best_position IS NOT NULL THEN k.best_position END) as best_position,
           MAX(CASE WHEN k.worst_position IS NOT NULL THEN k.worst_position END) as worst_position,
           MAX(k.last_checked_at) as last_checked_at,
           COUNT(DISTINCT c.id) as competitor_count
    FROM businesses b
    LEFT JOIN keywords k ON b.id = k.business_id
    LEFT JOIN competitors c ON b.id = c.business_id
    WHERE b.user_id = ?
    GROUP BY b.id
    ORDER BY b.updated_at DESC
  `, [userId], (err, rows) => {
    if (err) {
      logger.error({ err }, 'Error fetching businesses');
      res.status(500).json({ error: 'Failed to fetch businesses' });
    } else {
      res.json(rows);
    }
  });
});

router.post('/rankings/businesses', authenticate, (req, res) => {
  const userId = req.user.id;
  const { name, address, phone, email, website, category, place_id, rating, reviews, photos, coordinates } = req.body;
  
  db.run(`
    INSERT INTO businesses (user_id, name, address, phone, email, website, category, place_id, rating, reviews, photos, coordinates)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [userId, name, address, phone, email, website, category, place_id, rating, reviews, photos, JSON.stringify(coordinates)], function(err) {
    if (err) {
      logger.error({ err }, 'Error creating business');
      res.status(500).json({ error: 'Failed to create business' });
    } else {
      res.json({ id: this.lastID, message: 'Business created successfully' });
    }
  });
});

router.get('/rankings/businesses/:id/keywords', authenticate, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  // Verify business belongs to user
  db.get('SELECT id FROM businesses WHERE id = ? AND user_id = ?', [id, userId], (err, business) => {
    if (err || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    db.all(`
      SELECT
        k.*,
        b.website AS business_website,
        (
          SELECT position
          FROM ranking_history rh
          WHERE rh.keyword_id = k.id
          ORDER BY rh.date DESC, rh.created_at DESC, rh.id DESC
          LIMIT 1
        ) AS latest_position,
        (
          SELECT date
          FROM ranking_history rh
          WHERE rh.keyword_id = k.id
          ORDER BY rh.date DESC, rh.created_at DESC, rh.id DESC
          LIMIT 1
        ) AS latest_date
      FROM keywords k
      JOIN businesses b ON b.id = k.business_id
      WHERE k.business_id = ?
      ORDER BY k.created_at DESC
    `, [id], (err, rows) => {
      if (err) {
        logger.error({ err }, 'Error fetching keywords');
        res.status(500).json({ error: 'Failed to fetch keywords' });
      } else {
        const hydrated = rows.map(row => ({
          ...row,
          last_snapshot: row.last_snapshot ? JSON.parse(row.last_snapshot) : [],
        }));
        res.json(hydrated);
      }
    });
  });
});

router.post('/rankings/businesses/:id/keywords', authenticate, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const {
    keyword,
    search_volume,
    difficulty,
    country,
    language,
    device,
    target_url,
    notes,
  } = req.body;

  if (!keyword || !keyword.trim()) {
    return res.status(400).json({ error: 'Keyword is required' });
  }
  
  // Verify business belongs to user
  db.get('SELECT id, website FROM businesses WHERE id = ? AND user_id = ?', [id, userId], (err, business) => {
    if (err || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const normalizedCountry = (country || '').trim().toUpperCase();
    const normalizedLanguage = (language || '').trim().toLowerCase();
    const normalizedDevice = (device || 'desktop').trim().toLowerCase();
    const normalizedTarget = target_url || business.website || '';
    
    db.run(`
      INSERT INTO keywords (
        business_id,
        keyword,
        search_volume,
        difficulty,
        country,
        language,
        device,
        target_url,
        notes,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      keyword.trim(),
      search_volume || null,
      difficulty || null,
      normalizedCountry || null,
      normalizedLanguage || null,
      normalizedDevice || 'desktop',
      normalizedTarget || null,
      notes || null,
      'idle',
    ], function(err) {
      if (err) {
        logger.error({ err }, 'Error creating keyword');
        res.status(500).json({ error: 'Failed to create keyword' });
      } else {
        db.get('SELECT * FROM keywords WHERE id = ?', [this.lastID], (loadErr, row) => {
          if (loadErr || !row) {
            return res.json({ id: this.lastID, message: 'Keyword added successfully' });
          }
          res.json({ keyword: row, message: 'Keyword added successfully' });
        });
      }
    });
  });
});

router.post('/rankings/businesses/:id/refresh', authenticate, heavyLimit, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const business = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id FROM businesses WHERE id = ? AND user_id = ?',
        [id, userId],
        (err, row) => {
          if (err) return reject(err);
          return resolve(row);
        },
      );
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const keywords = await new Promise((resolve, reject) => {
      db.all('SELECT id FROM keywords WHERE business_id = ?', [id], (err, rows) => {
        if (err) return reject(err);
        return resolve(rows);
      });
    });

    const results = [];
    for (const keyword of keywords) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const output = await refreshKeywordPosition({ keywordId: keyword.id, userId });
        results.push({ success: true, keyword: output.keyword, position: output.position });
      } catch (error) {
        logger.error({ err: error, keywordId: keyword.id }, 'Failed to refresh keyword');
        results.push({ success: false, keywordId: keyword.id, error: error.message || 'Failed to refresh keyword' });
      }
    }

    return res.json({ success: true, results });
  } catch (error) {
    logger.error({ err: error }, 'Bulk keyword refresh error');
    return res.status(500).json({ error: 'Failed to refresh keywords for business' });
  }
});

router.post('/rankings/keywords/:id/track', authenticate, heavyLimit, async (req, res) => {
  const keywordId = parseInt(req.params.id, 10);
  if (Number.isNaN(keywordId)) {
    return res.status(400).json({ error: 'Invalid keyword id' });
  }

  const {
    position,
    search_engine = 'google',
    location,
    device = 'desktop',
    target_url,
    country,
    language,
  } = req.body || {};

  const userId = req.user.id;
  const today = new Date();
  const date = today.toISOString().split('T')[0];

  const recordManualPosition = (numericPosition) => {
    db.get(`
      SELECT k.*, b.website as business_website
      FROM keywords k
      JOIN businesses b ON k.business_id = b.id
      WHERE k.id = ? AND b.user_id = ?
    `, [keywordId, userId], (err, keyword) => {
      if (err || !keyword) {
        return res.status(404).json({ error: 'Keyword not found' });
      }

      db.run(`
        INSERT INTO ranking_history (keyword_id, position, search_engine, location, device, date)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [keywordId, numericPosition, search_engine, location || keyword.country, device || keyword.device, date], (historyErr) => {
        if (historyErr) {
          logger.error({ err: historyErr }, 'Error tracking ranking');
          return res.status(500).json({ error: 'Failed to track ranking' });
        }

        const nextBest = numericPosition > 0 && (!keyword.best_position || numericPosition < keyword.best_position)
          ? numericPosition
          : keyword.best_position;
        const nextWorst = numericPosition > 0 && (!keyword.worst_position || numericPosition > keyword.worst_position)
          ? numericPosition
          : keyword.worst_position;

        db.run(`
          UPDATE keywords
          SET last_position = ?, best_position = ?, worst_position = ?, last_checked_at = ?, status = ?
          WHERE id = ?
        `, [numericPosition, nextBest || null, nextWorst || null, today.toISOString(), numericPosition > 0 ? 'tracked' : 'not_found', keywordId], (updateErr) => {
          if (updateErr) {
            logger.error({ err: updateErr }, 'Failed to update keyword after manual tracking');
            return res.status(500).json({ error: 'Failed to update keyword' });
          }
          db.get('SELECT * FROM keywords WHERE id = ?', [keywordId], (loadErr, row) => {
            if (loadErr || !row) {
              return res.json({ success: true, position: numericPosition });
            }
            res.json({ success: true, position: numericPosition, keyword: row });
          });
        });
      });
    });
  };

  if (position !== undefined && position !== null && position !== '') {
    const numericPosition = parseInt(position, 10);
    if (Number.isNaN(numericPosition) || numericPosition < 0) {
      return res.status(400).json({ error: 'Position must be a positive integer' });
    }
    return recordManualPosition(numericPosition);
  }

  try {
    const result = await refreshKeywordPosition({
      keywordId,
      userId,
      overrideTarget: target_url,
      overrideCountry: location || country,
      overrideLanguage: language,
      overrideDevice: device,
    });
    return res.json({
      success: true,
      position: result.position,
      keyword: result.keyword,
      snapshot: result.snapshot,
    });
  } catch (error) {
    logger.error({ err: error }, 'Keyword refresh error');
    return res.status(400).json({ error: error.message || 'Failed to refresh keyword with Google search data.' });
  }
});

router.delete('/rankings/keywords/:id', authenticate, (req, res) => {
  const { id } = req.params;
  db.get(`
    SELECT k.id
    FROM keywords k
    JOIN businesses b ON b.id = k.business_id
    WHERE k.id = ? AND b.user_id = ?
  `, [id, req.user.id], (err, keyword) => {
    if (err) {
      logger.error({ err }, 'Failed to verify keyword before deletion');
      return res.status(500).json({ error: 'Failed to delete keyword' });
    }
    if (!keyword) {
      return res.status(404).json({ error: 'Keyword not found' });
    }
    db.run('DELETE FROM keywords WHERE id = ?', [id], (deleteErr) => {
      if (deleteErr) {
        logger.error({ err: deleteErr }, 'Error deleting keyword');
        return res.status(500).json({ error: 'Failed to delete keyword' });
      }
      res.json({ success: true });
    });
  });
});

router.get('/rankings/keywords/:id/history', authenticate, (req, res) => {
  const { id } = req.params;
  const { days = 30 } = req.query;
  
  // Verify keyword belongs to user's business
  db.get(`
    SELECT k.id FROM keywords k
    JOIN businesses b ON k.business_id = b.id
    WHERE k.id = ? AND b.user_id = ?
  `, [id, req.user.id], (err, keyword) => {
    if (err || !keyword) {
      return res.status(404).json({ error: 'Keyword not found' });
    }
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const startDateStr = startDate.toISOString().split('T')[0];
    
    db.all(`
      SELECT * FROM ranking_history
      WHERE keyword_id = ? AND date >= ?
      ORDER BY date DESC
    `, [id, startDateStr], (err, rows) => {
      if (err) {
        logger.error({ err }, 'Error fetching ranking history');
        res.status(500).json({ error: 'Failed to fetch ranking history' });
      } else {
        res.json(rows);
      }
    });
  });
});

router.get('/rankings/businesses/:id/competitors', authenticate, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  // Verify business belongs to user
  db.get('SELECT id FROM businesses WHERE id = ? AND user_id = ?', [id, userId], (err, business) => {
    if (err || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    db.all(`
      SELECT * FROM competitors
      WHERE business_id = ?
      ORDER BY position ASC
    `, [id], (err, rows) => {
      if (err) {
        logger.error({ err }, 'Error fetching competitors');
        res.status(500).json({ error: 'Failed to fetch competitors' });
      } else {
        res.json(rows);
      }
    });
  });
});

router.post('/rankings/businesses/:id/competitors', authenticate, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { name, address, distance, rating, reviews, position, backlinks, website } = req.body;
  
  // Verify business belongs to user
  db.get('SELECT id FROM businesses WHERE id = ? AND user_id = ?', [id, userId], (err, business) => {
    if (err || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    db.run(`
      INSERT INTO competitors (business_id, name, address, distance, rating, reviews, position, backlinks, website)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, address, distance, rating, reviews, position, backlinks, website], function(err) {
      if (err) {
        logger.error({ err }, 'Error creating competitor');
        res.status(500).json({ error: 'Failed to create competitor' });
      } else {
        res.json({ id: this.lastID, message: 'Competitor added successfully' });
      }
    });
  });
});

router.get('/rankings/businesses/:id/backlinks', authenticate, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  // Verify business belongs to user
  db.get('SELECT id FROM businesses WHERE id = ? AND user_id = ?', [id, userId], (err, business) => {
    if (err || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    db.all(`
      SELECT * FROM backlinks
      WHERE business_id = ?
      ORDER BY created_at DESC
    `, [id], (err, rows) => {
      if (err) {
        logger.error({ err }, 'Error fetching backlinks');
        res.status(500).json({ error: 'Failed to fetch backlinks' });
      } else {
        res.json(rows);
      }
    });
  });
});

router.post('/rankings/businesses/:id/backlinks', authenticate, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { url, domain, title, anchor_text, type, domain_authority, spam_score, date_found } = req.body;
  
  // Verify business belongs to user
  db.get('SELECT id FROM businesses WHERE id = ? AND user_id = ?', [id, userId], (err, business) => {
    if (err || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    db.run(`
      INSERT INTO backlinks (business_id, url, domain, title, anchor_text, type, domain_authority, spam_score, date_found)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, url, domain, title, anchor_text, type, domain_authority, spam_score, date_found], function(err) {
      if (err) {
        logger.error({ err }, 'Error creating backlink');
        res.status(500).json({ error: 'Failed to create backlink' });
      } else {
        res.json({ id: this.lastID, message: 'Backlink added successfully' });
      }
    });
  });
});

router.get('/rankings/businesses/:id/traffic', authenticate, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { days = 30 } = req.query;
  
  // Verify business belongs to user
  db.get('SELECT id FROM businesses WHERE id = ? AND user_id = ?', [id, userId], (err, business) => {
    if (err || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const startDateStr = startDate.toISOString().split('T')[0];
    
    db.all(`
      SELECT * FROM traffic_data
      WHERE business_id = ? AND date >= ?
      ORDER BY date DESC
    `, [id, startDateStr], (err, rows) => {
      if (err) {
        logger.error({ err }, 'Error fetching traffic data');
        res.status(500).json({ error: 'Failed to fetch traffic data' });
      } else {
        res.json(rows);
      }
    });
  });
});

router.post('/rankings/businesses/:id/traffic', authenticate, (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { monthly_visits, growth_rate, organic_percentage, direct_percentage, social_percentage, referral_percentage, top_keywords } = req.body;
  const date = new Date().toISOString().split('T')[0];
  
  // Verify business belongs to user
  db.get('SELECT id FROM businesses WHERE id = ? AND user_id = ?', [id, userId], (err, business) => {
    if (err || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    
    db.run(`
      INSERT INTO traffic_data (business_id, monthly_visits, growth_rate, organic_percentage, direct_percentage, social_percentage, referral_percentage, top_keywords, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, monthly_visits, growth_rate, organic_percentage, direct_percentage, social_percentage, referral_percentage, JSON.stringify(top_keywords), date], function(err) {
      if (err) {
        logger.error({ err }, 'Error creating traffic data');
        res.status(500).json({ error: 'Failed to create traffic data' });
      } else {
        res.json({ id: this.lastID, message: 'Traffic data added successfully' });
      }
    });
  });
});

module.exports = router;
