'use strict';

const logger = require('../utils/logger');
const { CLAUDE_API_KEY } = require('../config/env');

// Best Claude models for content generation. First entry is preferred; later
// entries are fallbacks on 403/404. Update as Anthropic releases new versions.
const CLAUDE_MODEL_SEQUENCE = [
  'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
];

const CLAUDE_MAX_OUTPUT_TOKENS = 16000;
const CLAUDE_THINKING_BUDGET_TOKENS = 10000;

// Native fetch on Node 20+; this wrapper is kept for back-compat with callers
// that still `await ensureFetch()` rather than calling the global directly.
async function ensureFetch() {
  return globalThis.fetch.bind(globalThis);
}

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

    if (model.includes('claude-sonnet-4') || model.includes('claude-3-7')) {
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
    });

    if (response.ok) return response.json();

    const errorText = await response.text();
    lastError = { status: response.status, message: parseClaudeErrorMessage(errorText), model };
    logger.error({ status: response.status, model, errorText }, 'Claude API error');

    if (response.status !== 403 && response.status !== 404) break;
  }

  const error = new Error(
    lastError?.message || 'Failed to generate content with the configured Claude model.',
  );
  error.status = lastError?.status || 502;
  throw error;
}

module.exports = {
  CLAUDE_MODEL_SEQUENCE,
  CLAUDE_MAX_OUTPUT_TOKENS,
  CLAUDE_THINKING_BUDGET_TOKENS,
  ensureFetch,
  parseClaudeErrorMessage,
  resolveClaudeKey,
  requestClaudeMessages,
};
