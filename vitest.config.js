// Vitest config for the backend (Node/Express) tests under `tests/`.
// The React client has its own tests + tsconfig; this file deliberately
// scopes only to the server.
export default {
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,mjs}'],
    exclude: ['client/**', 'node_modules/**'],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Each test file gets a fresh module graph so app.js's startup side-effects
    // (DB init, etc.) don't bleed between files.
    isolate: true,
    pool: 'forks',
  },
};
