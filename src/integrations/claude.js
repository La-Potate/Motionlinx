'use strict';

const logger = require('../utils/logger');
const { CLAUDE_API_KEY, CLAUDE_MODEL } = require('../config/env');

// Models for content generation. The first entry is preferred and can be set
// per install with CLAUDE_MODEL; the rest are fallbacks tried only on 403/404
// (no access / retired). The previous list fell back to two Claude 3.5 Sonnet
// builds that Anthropic retired in 2025, so once the primary went the chain
// only produced a second and third 404.
const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-5';
const CLAUDE_MODEL_SEQUENCE = [
  ...new Set([CLAUDE_MODEL || CLAUDE_DEFAULT_MODEL, CLAUDE_DEFAULT_MODEL, 'claude-sonnet-4-20250514']),
];

// Extended thinking is only requested for model families known to accept the
// budgeted form; an operator-supplied model outside that set is called plainly
// rather than risking a 400 that the fallback chain would not catch.
const THINKING_MODEL_PATTERN = /claude-(sonnet-4|opus-4|3-7)/;

const CLAUDE_MAX_OUTPUT_TOKENS = 16000;
const CLAUDE_THINKING_BUDGET_TOKENS = 10000;

// A 16k-token non-streaming generation can legitimately run for minutes, so
// this is far above the shared default — but it is still a bound. Before, a
// stalled connection to the API held the request open indefinitely.
const CLAUDE_REQUEST_TIMEOUT_MS = 180000;

// Kept exported for back-compat; resolves to the shared timed, SSRF-guarded fetch.
const { ensureFetch } = require('../utils/smartFetch');

function parseClaudeErrorMessage(text = '') {
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    if (parsed?.error?.message) return parsed.error.message;
  } catch (_) {
    // ignore
  }
  return typeof text === 'string' ? text.slice(0, 500) : '';
}

/**
 * Resolve the Claude API key. Pass a `userKey` override (e.g. one retrieved
 * from system settings) or fall back to `CLAUDE_API_KEY` env var.
 */
function resolveClaudeKey(userKey) {
  return userKey || CLAUDE_API_KEY || '';
}

/**
 * POST to /v1/messages with model fallback + extended thinking support.
 * Throws an Error with `.status` on failure.
 */
async function requestClaudeMessages(baseBody, apiKey) {
  if (!apiKey) {
    const err = new Error('Claude API key is not configured');
    err.status = 503;
    throw err;
  }
  const fetcher = await ensureFetch();
  let lastError = null;

  for (const model of CLAUDE_MODEL_SEQUENCE) {
    const requestBody = {
      ...baseBody,
      model,
      max_tokens: CLAUDE_MAX_OUTPUT_TOKENS,
    };

    if (THINKING_MODEL_PATTERN.test(model)) {
      requestBody.thinking = {
        type: 'enabled',
        budget_tokens: Math.min(
          CLAUDE_THINKING_BUDGET_TOKENS,
          Math.max(0, CLAUDE_MAX_OUTPUT_TOKENS - 1),
        ),
      };
    }

    const response = await fetcher('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
      timeout: CLAUDE_REQUEST_TIMEOUT_MS,
    });

    if (response.ok) return response.json();

    const errorText = await response.text();
    lastError = { status: response.status, message: parseClaudeErrorMessage(errorText), model };
    logger.error({ status: response.status, model, errorText }, 'Claude API error');

    if (response.status !== 403 && response.status !== 404) break;
    logger.warn(
      { model, status: response.status },
      'Claude model unavailable (retired or not enabled for this key); trying the next fallback. Set CLAUDE_MODEL to a current model.',
    );
  }

  const error = new Error(
    lastError?.message || 'Failed to generate content with the configured Claude model.',
  );
  error.status = lastError?.status || 502;
  throw error;
}

module.exports = {
  CLAUDE_DEFAULT_MODEL,
  CLAUDE_MODEL_SEQUENCE,
  CLAUDE_MAX_OUTPUT_TOKENS,
  CLAUDE_THINKING_BUDGET_TOKENS,
  ensureFetch,
  parseClaudeErrorMessage,
  resolveClaudeKey,
  requestClaudeMessages,
};
