'use strict';

const { getApiKey } = require('../services/apiKeys');
const express = require('express');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { tieredRateLimit } = require('../middleware/rateLimits');
const { dbGet, dbAll, dbRun, db, withTransaction } = require('../utils/dbAsync');
const { getSystemApiKey } = require('../storage/systemSettings');
const { readUserSettingsFromDisk } = require('../storage/userSettings');
const { ensureFetch } = require('../utils/smartFetch');
const { getSourcesForCountry, CITATION_SOURCES_USA, CITATION_SOURCES_UK } = require('../data/citation-sources');
const { runCitationAudit, abortAudit } = require('../jobs/citationAudit');

const router = express.Router();
router.use(authenticate);

router.get('/list', async (req, res) => {
  try {
    const audits = await dbAll(
      'SELECT * FROM citation_audits WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id],
    );
    res.json({ audits });
  } catch (err) {
    logger.error({ err }, 'Failed to list citation audits');
    res.status(500).json({ error: 'Failed to load audits.' });
  }
});

router.get('/sources/:country', (req, res) => {
  res.json({ sources: getSourcesForCountry(req.params.country) });
});

router.get('/:id', async (req, res) => {
  try {
    const audit = await dbGet(
      'SELECT * FROM citation_audits WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (!audit) return res.status(404).json({ error: 'Audit not found.' });
    const results = await dbAll(
      'SELECT * FROM citation_audit_results WHERE audit_id = ? ORDER BY source_name ASC',
      [req.params.id],
    );
    res.json({ audit, results });
  } catch (err) {
    logger.error({ err }, 'Failed to get citation audit');
    res.status(500).json({ error: 'Failed to load audit.' });
  }
});

router.post('/create', async (req, res) => {
  try {
    const {
      businessName,
      businessWebsite,
      businessAddress,
      businessPhone,
      businessCity,
      businessState,
      businessZipcode,
      country,
    } = req.body || {};

    if (!businessName) return res.status(400).json({ error: 'Business name is required.' });

    const countryCode = (country || 'US').toUpperCase();
    const sources = getSourcesForCountry(countryCode);

    // The audit row and its per-source result rows are written in ONE
    // transaction, and every insert is awaited before we respond.
    //
    // Both properties matter. Previously the result rows were fired off with
    // a callback-less `stmt.run()` and the response was sent immediately, so
    // the inserts were still in flight after the client had the auditId. A
    // client that deleted the audit in that window removed the parent row
    // mid-flight, the pending inserts hit the audit_id foreign key, and
    // node-sqlite3 surfaced the failure as an 'error' event on the Statement.
    // With no listener attached that became an uncaught exception and killed
    // the process. Awaiting each insert both propagates errors into this
    // try/catch and closes the race window entirely.
    const auditId = await withTransaction(async () => {
      const result = await dbRun(
        `INSERT INTO citation_audits
         (user_id, business_name, business_website, business_address, business_phone,
          business_city, business_state, business_zipcode, country, status, total_citations)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          req.user.id,
          businessName,
          businessWebsite || '',
          businessAddress || '',
          businessPhone || '',
          businessCity || '',
          businessState || '',
          businessZipcode || '',
          countryCode,
          sources.length,
        ],
      );
      const newAuditId = result.lastID;

      // Prepared statement because this can be 50+ inserts.
      const stmt = db.prepare(
        `INSERT INTO citation_audit_results (audit_id, source_id, source_name, source_url, status)
         VALUES (?, ?, ?, ?, 'pending')`,
      );
      try {
        for (const source of sources) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve, reject) => {
            stmt.run([newAuditId, source.id, source.name, source.url], (err) =>
              err ? reject(err) : resolve(),
            );
          });
        }
      } finally {
        // Always release the statement, even if an insert rejected above —
        // otherwise the handle leaks and the transaction can't be rolled back.
        await new Promise((resolve) => {
          stmt.finalize(() => resolve());
        });
      }
      return newAuditId;
    });

    res.json({ success: true, auditId });
  } catch (err) {
    logger.error({ err }, 'Failed to create citation audit');
    res.status(500).json({ error: 'Failed to create audit.' });
  }
});

router.post('/:id/start', tieredRateLimit('heavy'), async (req, res) => {
  try {
    const audit = await dbGet(
      'SELECT * FROM citation_audits WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (!audit) return res.status(404).json({ error: 'Audit not found.' });
    if (audit.status === 'running') {
      return res.status(400).json({ error: 'Audit is already running.' });
    }
    if (!(await getApiKey(req.user.id, 'serper'))) {
      return res.status(400).json({
        error:
          'Serper API key not configured. Please add your Serper API key in Settings to run citation audits.',
      });
    }

    await dbRun(
      "UPDATE citation_audits SET status = 'running', started_at = CURRENT_TIMESTAMP, progress = 0 WHERE id = ?",
      [req.params.id],
    );

    // Fire-and-forget background runner. Client polls /:id for progress.
    runCitationAudit(req.params.id, audit);

    res.json({ success: true, message: 'Audit started.' });
  } catch (err) {
    logger.error({ err }, 'Failed to start citation audit');
    res.status(500).json({ error: 'Failed to start audit.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await abortAudit(req.params.id);
    await dbRun('DELETE FROM citation_audit_results WHERE audit_id = ?', [req.params.id]);
    await dbRun('DELETE FROM citation_audits WHERE id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete citation audit');
    res.status(500).json({ error: 'Failed to delete audit.' });
  }
});

router.get('/:id/export', async (req, res) => {
  try {
    const audit = await dbGet(
      'SELECT * FROM citation_audits WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    if (!audit) return res.status(404).json({ error: 'Audit not found' });

    const results = await dbAll(
      'SELECT * FROM citation_audit_results WHERE audit_id = ? ORDER BY source_name',
      [req.params.id],
    );

    const csvLines = [
      'Domain,View Link,Status,Name Match,Address Match,Phone Match,Website Match',
    ];
    results.forEach((row) => {
      const domain = (row.source_name || '').replace(/"/g, '""');
      const link = (row.found_url || row.source_url || '').replace(/"/g, '""');
      csvLines.push(
        [
          `"${domain}"`,
          `"${link}"`,
          `"${row.status || 'pending'}"`,
          row.name_match ? 'Yes' : 'No',
          row.address_match ? 'Yes' : 'No',
          row.phone_match ? 'Yes' : 'No',
          row.website_match ? 'Yes' : 'No',
        ].join(','),
      );
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="citation-audit-${req.params.id}-${Date.now()}.csv"`,
    );
    res.send(csvLines.join('\n'));
  } catch (err) {
    logger.error({ err }, 'Failed to export citation audit');
    res.status(500).json({ error: 'Failed to export audit' });
  }
});

module.exports = router;
module.exports.CITATION_SOURCES_USA = CITATION_SOURCES_USA;
module.exports.CITATION_SOURCES_UK = CITATION_SOURCES_UK;
