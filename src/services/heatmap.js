'use strict';

const path = require('path');
const { ensureDir, USER_FILES_ROOT } = require('../storage/paths');
const { placesTextSearch } = require('../integrations/googlePlaces');

function getUserHeatmapsDir(userId) {
  const dir = path.join(USER_FILES_ROOT, String(userId), 'heatmaps');
  ensureDir(dir);
  return dir;
}

/**
 * Convert a meters offset to lat/lng degrees at a given latitude. Uses a flat
 * approximation (good enough for the < ~50km grids used by the heatmap).
 */
function metersToDegrees(lat, metersNorth, metersEast) {
  const dLat = metersNorth / 111320;
  const dLng = metersEast / (111320 * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLng };
}

/**
 * Query Google Places at a (lat, lng) for the keyword, then find what
 * position the target placeId ranks at. Returns null rank if not in results.
 */
async function rankAtLocation({ placeId, keyword, lat, lng, radius, apiKey }) {
  const data = await placesTextSearch({ query: keyword, lat, lng, radius, apiKey });
  if (data.status !== 'OK') {
    return { rank: null, results: [], status: data.status, error_message: data.error_message };
  }
  const idx = (data.results || []).findIndex((r) => r.place_id === placeId);
  return { rank: idx >= 0 ? idx + 1 : null, results: data.results };
}

/**
 * Run rankAtLocation against a square grid centered on (center.lat, lng).
 * Returns a 2D array of ranks (or null). Concurrent at most `maxConcurrent`
 * cells in flight to avoid Places quota bursts.
 */
async function computeHeatmapGrid({ placeId, keyword, center, gridSize, stepMeters, radiusMeters, apiKey, maxConcurrent = 5 }) {
  const size = Math.max(1, Math.min(15, parseInt(gridSize, 10) || 7));
  const half = Math.floor(size / 2);
  const rows = [];
  const tasks = [];

  for (let r = -half; r <= half; r += 1) {
    const rowIndex = r + half;
    rows[rowIndex] = [];
    for (let c = -half; c <= half; c += 1) {
      const { dLat, dLng } = metersToDegrees(center.lat, r * stepMeters, c * stepMeters);
      const lat = center.lat + dLat;
      const lng = center.lng + dLng;
      tasks.push(
        rankAtLocation({ placeId, keyword, lat, lng, radius: radiusMeters, apiKey })
          .then(({ rank }) => ({ r: rowIndex, c: c + half, rank }))
          .catch(() => ({ r: rowIndex, c: c + half, rank: null })),
      );
    }
  }

  for (let i = 0; i < tasks.length; i += maxConcurrent) {
    // eslint-disable-next-line no-await-in-loop
    const chunk = await Promise.all(tasks.slice(i, i + maxConcurrent));
    chunk.forEach(({ r, c, rank }) => {
      rows[r][c] = rank;
    });
  }

  return { rows, size };
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function renderHeatmapHTML({ report, rows }) {
  const size = rows.length;
  return `<!doctype html>
  <html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.name)} - Heatmap</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#111827;margin:0;padding:16px}
    .meta{margin-bottom:12px}
    .meta h2{margin:0 0 6px 0}
    .grid{display:grid;gap:4px;grid-template-columns:repeat(${size},36px)}
    .cell{width:36px;height:36px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600}
    .na{background:#e5e7eb;color:#6b7280}
    .good{background:#16a34a}
    .ok{background:#f59e0b}
    .bad{background:#ef4444}
  </style></head><body>
  <div class="meta">
    <h2>${escapeHtml(report.name)}</h2>
    <div>Keyword: <strong>${escapeHtml(report.keyword)}</strong></div>
    <div>Grid: ${report.grid_size}x${report.grid_size}, Step: ${report.step_meters}m, Radius: ${report.radius_meters}m</div>
    <div>Generated at: ${new Date().toLocaleString()}</div>
  </div>
  <div class="grid">
    ${rows.map((row) => row.map((cell) => {
      const cls = cell == null ? 'na' : cell <= 3 ? 'good' : cell <= 10 ? 'ok' : 'bad';
      return `<div class="cell ${cls}">${cell ?? '-'}</div>`;
    }).join('')).join('')}
  </div>
  </body></html>`;
}

module.exports = {
  getUserHeatmapsDir,
  metersToDegrees,
  rankAtLocation,
  computeHeatmapGrid,
  renderHeatmapHTML,
  escapeHtml,
};
