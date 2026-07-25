'use strict';

const { OAuth2Client } = require('google-auth-library');
const logger = require('../utils/logger');
const { GOOGLE_CLIENT_ID } = require('../config/env');

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

if (!googleClient) {
  logger.info('Google authentication is disabled. Set GOOGLE_CLIENT_ID to enable it.');
}

function isGoogleEnabled() {
  return Boolean(googleClient);
}

async function verifyGoogleIdToken(idToken) {
  if (!googleClient) {
    const err = new Error('Google sign-in not configured');
    err.status = 503;
    throw err;
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload();
}

module.exports = {
  googleClient,
  isGoogleEnabled,
  verifyGoogleIdToken,
  GOOGLE_CLIENT_ID,
};
