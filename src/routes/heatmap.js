'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const express = require('express');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { tieredRateLimit } = require('../middleware/rateLimits');
const { dbGet, dbAll, dbRun } = require('../utils/dbAsync');
const { getUserGooglePlacesKey } = require('../integrations/googlePlaces');
const {
  getUserHeatmapsDir,
  computeHeatmapGrid,
  renderHeatmapHTML,
} = require('../services/heatmap');

const router = express.Router();
const heavyLimit = tieredRateLimit('heavy');

// Mounted at `/api` (not `/api/heatmap`) because routes straddle two prefixes
// (`/serp/heatmap` and `/heatmap/reports/*`). authenticate is attached per
// route to avoid intercepting unrelated `/api/*` traffic.

// One-shot heatmap grid — does NOT persist a snapshot, just returns the rank grid.
router.post('/serp/heatmap', authenticate, heavyLimit, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      placeId,
      keyword,
      center,
      gridSize = 7,
      stepMeters = 500,
      radiusMeters = 3000,
      apiKey,
    } = req.body || {};

    if (!placeId || !keyword || !center?.lat || !center?.lng) {
      return res.status(400).json({
        success: false,
        error: 'placeId, keyword and center {lat,lng} are required',
      });
    }

    const key = apiKey || (await getUserGooglePlacesKey(userId));
    if (!key) {
      return res.status(400).json({ success: false, error: 'Google Places API key not configured' });
    }

    const { rows, size } = await computeHeatmapGrid({
      placeId,
      keyword,
      center,
      gridSize,
      stepMeters,
      radiusMeters,
      apiKey: key,
    });

    res.json({
      success: true,
      data: { grid: rows, center, gridSize: size, stepMeters, radiusMeters },
    });
  } catch (err) {
    logger.error({ err }, 'Heatmap error');
    res.status(500).json({ success: false, error: 'Failed to generate heatmap' });
  }
});

// ---- Persisted heatmap reports ----
router.get('/heatmap/reports', authenticate, async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT id, name, address, keyword, grid_size, radius_meters, step_meters,
              snapshots, created_at, last_run_at
       FROM heatmap_reports WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id],
    );
    res.json({ reports: rows });
  } catch (err) {
    logger.error({ err }, 'List heatmap reports failed');
    res.status(500).json({ error: 'Failed to list reports' });
  }
});

router.post('/heatmap/reports', authenticate, async (req, res) => {
  const {
    name,
    placeId,
    address,
    lat,
    lng,
    keyword,
    gridSize = 7,
    stepMeters = 500,
    radiusMeters = 3000,
    shape = 'square',
    useRadius = 1,
    useMeters = 1,
  } = req.body || {};
  if (!name || !placeId || !lat || !lng || !keyword) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const result = await dbRun(
      `INSERT INTO heatmap_reports
       (user_id, name, place_id, address, lat, lng, keyword, grid_size, step_meters,
        radius_meters, shape, use_radius, use_meters)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        name,
        placeId,
        address || '',
        lat,
        lng,
        keyword,
        gridSize,
        stepMeters,
        radiusMeters,
        shape,
        useRadius ? 1 : 0,
        useMeters ? 1 : 0,
      ],
    );
    res.status(201).json({ id: result.lastID });
  } catch (err) {
    logger.error({ err }, 'Create heatmap report failed');
    res.status(500).json({ error: 'Failed to create report' });
  }
});

router.post('/heatmap/reports/:id/generate', authenticate, heavyLimit, async (req, res) => {
  try {
    const report = await dbGet(
      'SELECT * FROM heatmap_reports WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const key = await getUserGooglePlacesKey(req.user.id);
    if (!key) return res.status(400).json({ error: 'Google Places API key not configured' });

    const { rows } = await computeHeatmapGrid({
      placeId: report.place_id,
      keyword: report.keyword,
      center: { lat: report.lat, lng: report.lng },
      gridSize: report.grid_size,
      stepMeters: report.step_meters,
      radiusMeters: report.radius_meters,
      apiKey: key,
    });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `heatmap-${report.id}-${ts}.html`;
    const userHeatmapDir = getUserHeatmapsDir(req.user.id);
    const filePath = path.join(userHeatmapDir, fileName);
    await fsp.writeFile(filePath, renderHeatmapHTML({ report, rows }), 'utf8');

    await dbRun(
      'UPDATE heatmap_reports SET snapshots = snapshots + 1, last_run_at = CURRENT_TIMESTAMP, latest_html_path = ? WHERE id = ?',
      [fileName, report.id],
    );
    res.json({ message: 'Snapshot generated', file: `/api/heatmap/reports/${report.id}/html` });
  } catch (err) {
    logger.error({ err }, 'Generate heatmap snapshot error');
    res.status(500).json({ error: 'Failed to generate snapshot' });
  }
});

router.get('/heatmap/reports/:id/html', authenticate, async (req, res) => {
  try {
    const row = await dbGet(
      'SELECT latest_html_path FROM heatmap_reports WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (!row?.latest_html_path) return res.status(404).send('No snapshot');
    const userHeatmapDir = getUserHeatmapsDir(req.user.id);
    const full = path.join(userHeatmapDir, path.basename(row.latest_html_path));
    if (!fs.existsSync(full)) return res.status(404).send('Snapshot file missing');
    res.sendFile(full);
  } catch (err) {
    logger.error({ err }, 'Heatmap snapshot serve error');
    res.status(500).send('Failed to load snapshot');
  }
});

router.delete('/heatmap/reports/:id', authenticate, async (req, res) => {
  try {
    await dbGet('SELECT latest_html_path FROM heatmap_reports WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);

    // Async cleanup helper: delete matching snapshots, swallow per-file errors.
    const removeMatchingSnapshots = async (dir) => {
      let files = [];
      try {
        files = await fsp.readdir(dir);
      } catch (_) {
        return;
      }
      const matches = files.filter(
        (f) => f.startsWith(`heatmap-${req.params.id}-`) && f.endsWith('.html'),
      );
      await Promise.all(
        matches.map((f) => fsp.unlink(path.join(dir, f)).catch(() => undefined)),
      );
    };

    await removeMatchingSnapshots(getUserHeatmapsDir(req.user.id));

    const result = await dbRun(
      'DELETE FROM heatmap_reports WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (!result.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    logger.error({ err }, 'Delete heatmap report failed');
    res.status(500).json({ error: 'Failed to delete' });
  }
});

module.exports = router;
