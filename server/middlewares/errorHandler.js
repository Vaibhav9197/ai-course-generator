import { ApiError } from '../utils/ApiError.js';
import { isProduction } from '../config/env.js';

/** 404 fallthrough for unmatched routes. */
export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Centralised error handler. Produces a consistent envelope the frontend's
 * ErrorMessage component can render directly:
 *   { error: { message, code?, details? } }
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
export function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Something went wrong.';
  let code = err.code;
  let details = err.details;

  // express-oauth2-jwt-bearer throws UnauthorizedError with a status already set.
  if (err.name === 'UnauthorizedError' || err.name === 'InvalidTokenError') {
    status = 401;
    message = 'Invalid or expired access token.';
    code = 'invalid_token';
  }

  // Mongoose: bad ObjectId in a path param is a client error, not a server fault.
  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}: ${err.value}`;
    code = 'invalid_id';
  }

  if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = 'Validation failed.';
    code = 'validation_error';
    details = Object.fromEntries(
      Object.entries(err.errors).map(([key, value]) => [key, value.message]),
    );
  }

  const isServerFault = status >= 500;
  const isIntentional = err instanceof ApiError;

  if (isServerFault || !isIntentional) {
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${status}`, err);
  }

  // Never leak internal messages for unexpected server faults in production.
  if (isServerFault && isProduction && !isIntentional) {
    message = 'Something went wrong. Please try again.';
    details = undefined;
  }

  res.status(status).json({
    error: {
      message,
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
    },
  });
}
