import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * A-17. The model fallback chain used to end in two Claude 3.5 Sonnet builds
 * that Anthropic retired in 2025, so once the primary model went, a 404 fell
 * through to two more 404s and the user saw a generic failure. The chain is
 * now a current default, overridable per install, with no retired entries.
 */
describe('Claude model sequence', () => {
  const claude = require('../src/integrations/claude');

  it('starts with the default model and contains no retired 3.x builds', () => {
    expect(claude.CLAUDE_MODEL_SEQUENCE[0]).toBe(claude.CLAUDE_DEFAULT_MODEL);
    for (const model of claude.CLAUDE_MODEL_SEQUENCE) {
      expect(model).not.toMatch(/claude-3-5|claude-3-opus|claude-3-haiku|claude-2/);
    }
  });

  it('has no duplicate entries even when CLAUDE_MODEL equals the default', () => {
    expect(new Set(claude.CLAUDE_MODEL_SEQUENCE).size).toBe(claude.CLAUDE_MODEL_SEQUENCE.length);
  });

  it('fails fast without a key rather than calling the API', async () => {
    await expect(claude.requestClaudeMessages({ messages: [] }, '')).rejects.toMatchObject({ status: 503 });
  });
});
