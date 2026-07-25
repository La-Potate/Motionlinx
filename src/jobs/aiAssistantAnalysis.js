'use strict';

const logger = require('../utils/logger');
const jobQueue = require('./jobQueue');
const engine = require('../services/aiAssistant/engine');
const { getUserDataForSeoCredentials } = require('../integrations/dataforseo');
const { getValidAccessToken } = require('../routes/gsc');

const JOB_TYPE = 'ai-assistant-analysis';

// (projectId → jobId) lets cancel(projectId) target the queue entry.
const projectJobIds = new Map();

async function handler({ projectId, userId }, { signal, reportProgress }) {
  try {
    const accessToken = await getValidAccessToken(userId);
    const dfsCreds = await getUserDataForSeoCredentials(userId);
    const out = await engine.runAnalysis({
      projectId,
      accessToken,
      dfsCreds,
      signal,
      reportProgress,
    });
    return out;
  } catch (err) {
    logger.error({ err: err.message, projectId, userId }, 'AI Assistant analysis failed');
    throw err;
  }
}

jobQueue.registerHandler(JOB_TYPE, handler, { concurrency: 1 });

function enqueueAnalysis({ projectId, userId }) {
  const numericProject = parseInt(projectId, 10);
  const jobId = jobQueue.submit(
    JOB_TYPE,
    { projectId: numericProject, userId },
    { meta: { projectId: numericProject, userId } },
  );
  projectJobIds.set(numericProject, jobId);
  return jobId;
}

async function cancelAnalysis(projectId) {
  const numericProject = parseInt(projectId, 10);
  const jobId = projectJobIds.get(numericProject);
  if (!jobId) return false;
  const ok = await jobQueue.cancel(jobId);
  if (ok) projectJobIds.delete(numericProject);
  return ok;
}

async function getJobForProject(projectId) {
  const numericProject = parseInt(projectId, 10);
  const jobId = projectJobIds.get(numericProject);
  if (!jobId) return null;
  return jobQueue.getJob(jobId);
}

module.exports = { JOB_TYPE, enqueueAnalysis, cancelAnalysis, getJobForProject };
