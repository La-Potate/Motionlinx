'use strict';

const logger = require('../utils/logger');
const { dbAll, dbRun } = require('../utils/dbAsync');
const { getSystemApiKey } = require('../storage/systemSettings');
const { getSourcesForCountry } = require('../data/citation-sources');
const { checkCitationViaSerper } = require('../integrations/serper');
const jobQueue = require('./jobQueue');

const JOB_TYPE = 'citation-audit';

// auditId -> jobId. Lets `abortAudit(auditId)` find the underlying queue job.
const auditJobIds = new Map();

async function runCitationAuditHandler({ auditId, audit }, { signal, reportProgress }) {
  const serperKey = getSystemApiKey('serper');
  if (!serperKey) {
    logger.error({ auditId }, 'Citation audit failed: no Serper API key configured');
    await dbRun("UPDATE citation_audits SET status = 'failed' WHERE id = ?", [auditId]);
    return { reason: 'no-serper-key' };
  }

  const sources = getSourcesForCountry(audit.country);
  const results = await dbAll(
    "SELECT * FROM citation_audit_results WHERE audit_id = ? AND status = 'pending'",
    [auditId],
  );

  let processed = 0;
  let foundCount = 0;
  let incorrectCount = 0;
  let notFoundCount = 0;

  for (const result of results) {
    if (signal.aborted) {
      logger.info({ auditId }, 'Citation audit aborted');
      break;
    }

    const source = sources.find((s) => s.id === result.source_id);
    if (!source) {
      processed += 1;
      continue;
    }

    try {
      // Per-request jitter to avoid hammering Serper or downstream sites.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

      // eslint-disable-next-line no-await-in-loop
      const searchResult = await checkCitationViaSerper(serperKey, audit, source);

      let status = 'not_found';
      let nameMatch = 0;
      let addressMatch = 0;
      let phoneMatch = 0;
      let websiteMatch = 0;

      if (searchResult.found) {
        nameMatch = searchResult.nameMatch ? 1 : 0;
        addressMatch = searchResult.addressMatch ? 1 : 0;
        phoneMatch = searchResult.phoneMatch ? 1 : 0;
        websiteMatch = searchResult.websiteMatch ? 1 : 0;

        const matchCount = nameMatch + addressMatch + phoneMatch + websiteMatch;
        const fieldsChecked =
          (audit.business_name ? 1 : 0) +
          (audit.business_address ? 1 : 0) +
          (audit.business_phone ? 1 : 0) +
          (audit.business_website ? 1 : 0);

        if (matchCount >= fieldsChecked * 0.75) {
          status = 'correct';
          foundCount += 1;
        } else {
          status = 'incorrect';
          incorrectCount += 1;
        }
      } else {
        notFoundCount += 1;
      }

      // eslint-disable-next-line no-await-in-loop
      await dbRun(
        `UPDATE citation_audit_results SET
           status = ?, found_url = ?, found_name = ?, found_address = ?, found_phone = ?, found_website = ?,
           name_match = ?, address_match = ?, phone_match = ?, website_match = ?, checked_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          status,
          searchResult.foundUrl || '',
          searchResult.foundName || '',
          searchResult.foundAddress || '',
          searchResult.foundPhone || '',
          searchResult.foundWebsite || '',
          nameMatch,
          addressMatch,
          phoneMatch,
          websiteMatch,
          result.id,
        ],
      );
    } catch (err) {
      logger.error({ source: result.source_name, err: err.message }, 'Citation check failed');
      // eslint-disable-next-line no-await-in-loop
      await dbRun(
        "UPDATE citation_audit_results SET status = 'error', error_message = ?, checked_at = CURRENT_TIMESTAMP WHERE id = ?",
        [err.message.slice(0, 500), result.id],
      );
    }

    processed += 1;
    const progress = Math.round((processed / results.length) * 100);
    reportProgress(progress, { foundCount, incorrectCount, notFoundCount });
    // eslint-disable-next-line no-await-in-loop
    await dbRun(
      'UPDATE citation_audits SET progress = ?, found_count = ?, incorrect_count = ?, not_found_count = ? WHERE id = ?',
      [progress, foundCount, incorrectCount, notFoundCount, auditId],
    );
  }

  await dbRun(
    "UPDATE citation_audits SET status = 'completed', completed_at = CURRENT_TIMESTAMP, progress = 100 WHERE id = ?",
    [auditId],
  );
  logger.info(
    { auditId, foundCount, incorrectCount, notFoundCount },
    'Citation audit completed',
  );
  return { foundCount, incorrectCount, notFoundCount, processed };
}

// Register with the queue at module load. Two audits at a time keeps Serper
// usage predictable while still letting the UI run more than one.
jobQueue.registerHandler(JOB_TYPE, runCitationAuditHandler, { concurrency: 2 });

/**
 * Submit a citation audit to the queue. Caller already pre-populated the
 * pending result rows in the DB; we just orchestrate the per-source checks.
 *
 * Returns the queue's jobId so callers could expose it via API; existing
 * routes ignore it and poll the DB for status, which still works.
 */
function runCitationAudit(auditId, audit) {
  const numericId = parseInt(auditId, 10);
  const jobId = jobQueue.submit(JOB_TYPE, { auditId: numericId, audit }, { meta: { auditId: numericId } });
  auditJobIds.set(numericId, jobId);
  return jobId;
}

async function abortAudit(auditId) {
  const numericId = parseInt(auditId, 10);
  const jobId = auditJobIds.get(numericId);
  if (!jobId) return false;
  const ok = await jobQueue.cancel(jobId);
  if (ok) auditJobIds.delete(numericId);
  return ok;
}

async function isAuditRunning(auditId) {
  const numericId = parseInt(auditId, 10);
  const jobId = auditJobIds.get(numericId);
  if (!jobId) return false;
  const job = await jobQueue.getJob(jobId);
  return Boolean(job && (job.status === 'pending' || job.status === 'running'));
}

module.exports = { runCitationAudit, abortAudit, isAuditRunning };
