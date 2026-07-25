'use strict';

const logger = require('../utils/logger');

/**
 * Typed error classes. Throw one of these from a route or service and the
 * errorHandler middleware will translate it into the right HTTP status and
 * JSON envelope.
 */
class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

class BadRequestError extends HttpError {
  constructor(message = 'Bad request', details) {
    super(400, message, details);
  }
}

class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

class ConflictError extends HttpError {
  constructor(message = 'Conflict') {
    super(409, message);
  }
}

class PaymentRequiredError extends HttpError {
  constructor(message = 'Payment required') {
    super(402, message);
  }
}

/**
 * Standard error response envelope: { error: string, details?: any }.
 */
function errorHandler(err, req, res, _next) {
  if (res.headersSent) {
    // eslint-disable-next-line no-underscore-dangle
    return _next(err);
  }

  if (err instanceof HttpError) {
    logger.warn({ err: { message: err.message, status: err.status }, path: req.originalUrl }, 'Handled HttpError');
    return res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  logger.error({ err, path: req.originalUrl, method: req.method }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
}

/**
 * Catch async route errors and forward to errorHandler. Use:
 *   router.get('/foo', asyncHandler(async (req, res) => { ... }));
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = {
  errorHandler,
  asyncHandler,
  HttpError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  PaymentRequiredError,
};
