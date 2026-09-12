'use strict';

const express = require('express');
const logger = require('../utils/logger');
const authenticate = require('../middleware/authenticate');
const { dbAll, dbGet, dbRun } = require('../utils/dbAsync');
const { enqueueAnalysis, cancelAnalysis, getJobForProject } = require('../jobs/aiAssistantAnalysis');
const gscRoute = require('./gsc');
const gsc = require('../services/gsc');

const router = express.Router();
router.use(authenticate);

// ---- Projects -----------------------------------------------------------
router.get('/projects', async (req, res) => {
  try {
    const projects = await dbAll(
      `SELECT p.id, p.name, p.primary_domain AS primaryDomain, p.notes,
              p.last_run_id AS lastRunId, p.created_at AS createdAt, p.updated_at AS updatedAt
       FROM seo_projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`,
      [req.user.id],
    );
    const ids = projects.map((p) => p.id);
    if (!ids.length) return res.json({ projects: [] });
    const props = await dbAll(
      `SELECT project_id AS projectId, site_url AS siteUrl
       FROM seo_project_properties WHERE project_id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    const propsByProject = props.reduce((acc, row) => {
      const list = acc.get(row.projectId) || [];
      list.push(row.siteUrl);
      acc.set(row.projectId, list);
      return acc;
    }, new Map());
    res.json({
      projects: projects.map((p) => ({ ...p, properties: propsByProject.get(p.id) || [] })),
    });
  } catch (err) {
    logger.error({ err }, 'List AI Assistant projects failed');
    res.status(500).json({ error: 'list_failed' });
  }
});

router.post('/projects', async (req, res) => {
  const { name, siteUrls, primaryDomain } = req.body || {};
  if (!name || !Array.isArray(siteUrls) || !siteUrls.length) {
    return res.status(400).json({ error: 'name_and_siteUrls_required' });
  }
  try {
    await dbRun('BEGIN');
    const result = await dbRun(
      `INSERT INTO seo_projects (user_id, name, primary_domain) VALUES (?, ?, ?)`,
      [req.user.id, String(name).trim(), primaryDomain || derivePrimaryDomain(siteUrls[0])],
    );
    const projectId = result.lastID;
    for (const siteUrl of siteUrls) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(
        `INSERT INTO seo_project_properties (project_id, site_url) VALUES (?, ?)
         ON CONFLICT(project_id, site_url) DO NOTHING`,
        [projectId, siteUrl],
      );
    }
    await dbRun('COMMIT');
    res.json({ project: { id: projectId, name, properties: siteUrls } });
  } catch (err) {
    await dbRun('ROLLBACK').catch(() => undefined);
    if (err.code === 'SQLITE_CONSTRAINT') {
      return res.status(409).json({ error: 'name_exists' });
    }
    logger.error({ err }, 'Create AI Assistant project failed');
    res.status(500).json({ error: 'create_failed' });
  }
});

router.put('/projects/:id', async (req, res) => {
  const { name, siteUrls, primaryDomain } = req.body || {};
  const projectId = parseInt(req.params.id, 10);
  try {
    const project = await dbGet(
      `SELECT id FROM seo_projects WHERE id = ? AND user_id = ?`,
      [projectId, req.user.id],
    );
    if (!project) return res.status(404).json({ error: 'not_found' });
    await dbRun('BEGIN');
    if (name) {
      await dbRun(
        `UPDATE seo_projects SET name = ?, primary_domain = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [String(name).trim(), primaryDomain || derivePrimaryDomain((siteUrls || [])[0]), projectId],
      );
    }
    if (Array.isArray(siteUrls)) {
      await dbRun(`DELETE FROM seo_project_properties WHERE project_id = ?`, [projectId]);
      for (const siteUrl of siteUrls) {
        // eslint-disable-next-line no-await-in-loop
        await dbRun(
          `INSERT INTO seo_project_properties (project_id, site_url) VALUES (?, ?)`,
          [projectId, siteUrl],
        );
      }
    }
    await dbRun('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await dbRun('ROLLBACK').catch(() => undefined);
    logger.error({ err }, 'Update AI Assistant project failed');
    res.status(500).json({ error: 'update_failed' });
  }
});

router.delete('/projects/:id', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  try {
    const result = await dbRun(
      `DELETE FROM seo_projects WHERE id = ? AND user_id = ?`,
      [projectId, req.user.id],
    );
    if (!result.changes) return res.status(404).json({ error: 'not_found' });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete AI Assistant project failed');
    res.status(500).json({ error: 'delete_failed' });
  }
});

// ---- Dashboard ----------------------------------------------------------
router.get('/projects/:id/dashboard', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  try {
    const project = await dbGet(
      `SELECT id, name, primary_domain AS primaryDomain, last_run_id AS lastRunId
       FROM seo_projects WHERE id = ? AND user_id = ?`,
      [projectId, req.user.id],
    );
    if (!project) return res.status(404).json({ error: 'not_found' });
    const properties = await dbAll(
      `SELECT site_url AS siteUrl FROM seo_project_properties WHERE project_id = ?`,
      [projectId],
    );

    const run = project.lastRunId
      ? await dbGet(
          `SELECT id, status, scores_json AS scoresJson, summary_json AS summaryJson,
                  url_count AS urlCount, prev_run_id AS prevRunId, started_at AS startedAt,
                  completed_at AS completedAt, error
           FROM analysis_runs WHERE id = ?`,
          [project.lastRunId],
        )
      : null;

    let scores = null;
    let summary = null;
    let prevScores = null;
    if (run) {
      scores = safeParse(run.scoresJson);
      summary = safeParse(run.summaryJson);
      if (run.prevRunId) {
        const prev = await dbGet(`SELECT scores_json FROM analysis_runs WHERE id = ?`, [run.prevRunId]);
        prevScores = prev ? safeParse(prev.scores_json) : null;
      }
    }

    const findings = run
      ? await dbAll(
          `SELECT id, category, type, severity, impact, title, description,
                  affected_urls_json AS affectedUrlsJson, status,
                  first_seen_run_id AS firstSeenRunId, resolved_run_id AS resolvedRunId
           FROM analysis_findings WHERE run_id = ? ORDER BY impact DESC, severity DESC LIMIT 200`,
          [run.id],
        )
      : [];

    const sitemaps = await dbAll(
      `SELECT site_url AS siteUrl, sitemap_url AS sitemapUrl, last_submitted AS lastSubmitted,
              last_downloaded AS lastDownloaded, warnings, errors, contents_count AS contentsCount
       FROM gsc_sitemaps WHERE project_id = ?`,
      [projectId],
    );
    const hasSitemap = sitemaps.length > 0;

    const job = await getJobForProject(projectId);

    res.json({
      project: { ...project, properties: properties.map((p) => p.siteUrl) },
      run: run
        ? {
            ...run,
            scores,
            summary,
            scoresJson: undefined,
            summaryJson: undefined,
          }
        : null,
      prevScores,
      findings: findings.map((f) => ({
        ...f,
        affectedUrls: safeParse(f.affectedUrlsJson) || [],
        affectedUrlsJson: undefined,
      })),
      sitemaps,
      hasSitemap,
      job,
    });
  } catch (err) {
    logger.error({ err }, 'Dashboard fetch failed');
    res.status(500).json({ error: 'dashboard_failed' });
  }
});

// ---- Runs ---------------------------------------------------------------
router.post('/projects/:id/runs', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  try {
    const project = await dbGet(
      `SELECT id FROM seo_projects WHERE id = ? AND user_id = ?`,
      [projectId, req.user.id],
    );
    if (!project) return res.status(404).json({ error: 'not_found' });

    const existingJob = await getJobForProject(projectId);
    if (existingJob && (existingJob.status === 'pending' || existingJob.status === 'running')) {
      return res.json({ jobId: existingJob.id, alreadyRunning: true });
    }

    const jobId = enqueueAnalysis({ projectId, userId: req.user.id });
    res.json({ jobId });
  } catch (err) {
    if (err.code === 'not_connected') return res.status(401).json({ error: 'not_connected' });
    if (err.code === 'reauth_required') return res.status(401).json({ error: 'reauth_required' });
    if (err.code === 'oauth_not_configured') return res.status(412).json({ error: 'oauth_not_configured' });
    logger.error({ err }, 'Enqueue analysis failed');
    res.status(500).json({ error: 'enqueue_failed' });
  }
});

router.delete('/projects/:id/runs/current', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  try {
    // Without this check any authenticated user could cancel another user's
    // running analysis just by guessing the project id.
    const project = await dbGet(`SELECT id FROM seo_projects WHERE id = ? AND user_id = ?`, [
      projectId,
      req.user.id,
    ]);
    if (!project) return res.status(404).json({ error: 'not_found' });
    const ok = await cancelAnalysis(projectId);
    res.json({ cancelled: ok });
  } catch (err) {
    logger.error({ err }, 'Cancel analysis failed');
    res.status(500).json({ error: 'cancel_failed' });
  }
});

router.get('/projects/:id/runs/:runId', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const runId = parseInt(req.params.runId, 10);
  try {
    const project = await dbGet(`SELECT id FROM seo_projects WHERE id = ? AND user_id = ?`, [projectId, req.user.id]);
    if (!project) return res.status(404).json({ error: 'not_found' });
    const run = await dbGet(
      `SELECT id, status, scores_json AS scoresJson, summary_json AS summaryJson, url_count AS urlCount,
              prev_run_id AS prevRunId, started_at AS startedAt, completed_at AS completedAt, error
       FROM analysis_runs WHERE id = ? AND project_id = ?`,
      [runId, projectId],
    );
    if (!run) return res.status(404).json({ error: 'run_not_found' });
    res.json({
      run: {
        ...run,
        scores: safeParse(run.scoresJson),
        summary: safeParse(run.summaryJson),
        scoresJson: undefined,
        summaryJson: undefined,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Get run failed');
    res.status(500).json({ error: 'run_fetch_failed' });
  }
});

// ---- Findings -----------------------------------------------------------
router.patch('/findings/:id', async (req, res) => {
  const findingId = parseInt(req.params.id, 10);
  const { status } = req.body || {};
  if (!['open', 'done'].includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }
  try {
    const finding = await dbGet(
      `SELECT f.id FROM analysis_findings f
       JOIN seo_projects p ON p.id = f.project_id
       WHERE f.id = ? AND p.user_id = ?`,
      [findingId, req.user.id],
    );
    if (!finding) return res.status(404).json({ error: 'not_found' });
    await dbRun(`UPDATE analysis_findings SET status = ? WHERE id = ?`, [status, findingId]);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Patch finding failed');
    res.status(500).json({ error: 'patch_failed' });
  }
});

// ---- Sitemap submit -----------------------------------------------------
router.post('/projects/:id/sitemaps', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const { siteUrl, sitemapUrl } = req.body || {};
  if (!siteUrl || !sitemapUrl) return res.status(400).json({ error: 'site_and_sitemap_required' });
  try {
    const project = await dbGet(`SELECT id FROM seo_projects WHERE id = ? AND user_id = ?`, [projectId, req.user.id]);
    if (!project) return res.status(404).json({ error: 'not_found' });
    const accessToken = await gscRoute.getValidAccessToken(req.user.id);
    await gsc.submitSitemap({ accessToken, siteUrl, sitemapUrl, userId: req.user.id });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'not_connected') return res.status(401).json({ error: 'not_connected' });
    if (err.code === 'reauth_required') return res.status(401).json({ error: 'reauth_required' });
    if (err.gscReason === 'forbidden') return res.status(403).json({ error: 'gsc_forbidden' });
    logger.error({ err }, 'Submit sitemap failed');
    res.status(502).json({ error: 'submit_failed', message: err.message });
  }
});

function safeParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function derivePrimaryDomain(siteUrl) {
  if (!siteUrl) return null;
  if (siteUrl.startsWith('sc-domain:')) return siteUrl.slice('sc-domain:'.length);
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return null;
  }
}

module.exports = router;
