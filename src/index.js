'use strict';

// Public entry point for the backend. Acts as both:
//   - a barrel module (`require('./src')` from tests / scripts gets the
//     `{ buildApp, start }` surface without booting anything), and
//   - the runnable startup script (`node src/index.js` boots the server).
//
// Internal code is free to import directly from src/routes, src/services,
// etc.; external consumers should stick to the surface exposed below.
const { buildApp, start } = require('./app');

module.exports = { buildApp, start };

if (require.main === module) {
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}
