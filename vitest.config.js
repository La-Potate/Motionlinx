// Vitest config for the backend (Node/Express) tests under `tests/`.
// The React client has its own tests + tsconfig; this file deliberately
// scopes only to the server.
export default {
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs}'],
    exclude: ['client/**', 'node_modules/**'],
    testTimeout: 30000,
    // Generous because buildTestApp() runs migrations and pulls in the heavy
    // dependency graph (googleapis ~0.7s, playwright ~1s when warm). On a cold
    // filesystem cache, several forks doing that at once pushed the hook past
    // 20s and failed suites that pass in ~3s warm. The work is real, not a
    // hang, so the timeout is the thing that was wrong.
    hookTimeout: 60000,
    // Each test file gets a fresh module graph so app.js's startup side-effects
    // (DB init, etc.) don't bleed between files.
    isolate: true,
    pool: 'forks',
  },
};
