'use strict';

const helmet = require('helmet');
const crypto = require('crypto');
const { isProd } = require('./env');

/**
 * Per-request CSP nonce. Routes that need to render inline scripts read it
 * from res.locals.cspNonce.
 *
 * Trade-offs:
 *  - script-src uses the nonce — no unsafe-inline for scripts.
 *  - style-src keeps 'unsafe-inline' because the Google Maps SDK injects
 *    inline styles at runtime (and CSP nonces don't propagate to those).
 *    The risk window is narrow (style injection rarely escalates to XSS) but
 *    we'd remove it the day we drop Maps or move to an iframe sandbox.
 *  - frame-ancestors 'none' blocks clickjacking iframes.
 */
const cspNonce = () => crypto.randomBytes(16).toString('base64');

function buildHelmet() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          (req, res) => `'nonce-${res.locals.cspNonce}'`,
          'https://maps.googleapis.com',
          'https://maps.gstatic.com',
          'https://www.google-analytics.com',
          'https://accounts.google.com',
          'https://js.stripe.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://maps.gstatic.com',
        ],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'https://maps.googleapis.com',
          'https://maps.gstatic.com',
          'https://*.googleapis.com',
          'https://*.gstatic.com',
          'https://*.google.com',
          'https://api.anthropic.com',
          'https://api.stripe.com',
          'https://api.dataforseo.com',
          ...(isProd ? [] : ['http://localhost:*', 'ws://localhost:*']),
        ],
        frameSrc: ["'self'", 'https://accounts.google.com', 'https://js.stripe.com'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // Google Maps tiles fail otherwise
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Belt-and-braces clickjacking defense; some browsers honor X-Frame-Options
    // even when ignoring frame-ancestors.
    frameguard: { action: 'deny' },
    // HSTS for production. preload: true is safe once the domain is stable —
    // it makes the browser refuse plaintext HTTP to the domain forever (until
    // the domain is removed from Chrome's preload list, which takes months).
    // Don't flip preload until you're certain HTTPS is permanently committed.
    strictTransportSecurity: isProd
      ? { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true }
      : false,
  });
}

/**
 * Express middleware that attaches a per-request CSP nonce to res.locals.
 * Mount BEFORE the helmet middleware so directives can reference the nonce.
 */
function attachCspNonce(req, res, next) {
  res.locals.cspNonce = cspNonce();
  next();
}

/**
 * Permissions-Policy denies powerful APIs we never use. Tightens the
 * blast radius if any embedded ad / 3rd-party iframe ever loads.
 *
 *   - camera, microphone, geolocation: not used by the app
 *   - interest-cohort: opt out of FLoC
 *   - payment: handled via Stripe Checkout in its own tab/iframe, not Payment Request API
 */
const PERMISSIONS_POLICY_VALUE = [
  'accelerometer=()',
  'autoplay=()',
  'browsing-topics=()',
  'camera=()',
  'display-capture=()',
  'encrypted-media=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'interest-cohort=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'picture-in-picture=()',
  'publickey-credentials-get=()',
  'screen-wake-lock=()',
  'sync-xhr=()',
  'usb=()',
  'xr-spatial-tracking=()',
].join(', ');

function permissionsPolicy(req, res, next) {
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY_VALUE);
  next();
}

/**
 * Dev-only middleware that ALSO emits a strict `Content-Security-Policy-Report-Only`
 * header (no style-src 'unsafe-inline'). The browser logs violations to the
 * console without blocking, so we can see which inline styles are still in the
 * way of tightening the real CSP. No effect in production.
 */
function buildCspReportOnly() {
  if (isProd) {
    return (_req, _res, next) => next();
  }
  return (req, res, next) => {
    const nonce = res.locals.cspNonce || '';
    const directives = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' https://maps.googleapis.com https://maps.gstatic.com https://accounts.google.com https://js.stripe.com`,
      // No 'unsafe-inline' here — what we're auditing toward.
      "style-src 'self' https://fonts.googleapis.com https://maps.gstatic.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      // Trusted Types: when set, browsers reject string assignments to DOM
      // sinks (innerHTML, etc.) unless they go through a TT policy. We emit
      // it report-only first so violations surface in console without
      // breaking the SPA — flip to enforced via the buildHelmet() CSP once
      // any TT policies the frontend needs are wired up.
      "require-trusted-types-for 'script'",
    ].join('; ');
    res.setHeader('Content-Security-Policy-Report-Only', directives);
    next();
  };
}

module.exports = { buildHelmet, attachCspNonce, permissionsPolicy, buildCspReportOnly };
