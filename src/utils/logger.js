'use strict';

const pino = require('pino');
const { isProd, isTest } = require('../config/env');

const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  ...(isTest ? { enabled: false } : {}),
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'password_hash',
      'jwt',
      'token',
      'refreshToken',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'JWT_SECRET',
      'CLAUDE_API_KEY',
      'DATAFORSEO_PASSWORD',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
