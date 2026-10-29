/**
 * Errors thrown with ApiError are treated as intentional, client-safe failures by the
 * central error handler; anything else is logged and reported as a generic 500.
 */
export class ApiError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.expose = true;
    this.code = options.code;
    this.details = options.details;
    if (options.cause) this.cause = options.cause;
  }

  static badRequest(message, options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'Authentication required.', options) {
    return new ApiError(401, message, options);
  }

  /**
   * Used for both "does not exist" and "not yours" so course IDs cannot be
   * enumerated by comparing 403s against 404s.
   */
  static notFound(message = 'Not found.', options) {
    return new ApiError(404, message, options);
  }

  static tooManyRequests(message = 'Too many requests.', options) {
    return new ApiError(429, message, options);
  }

  static badGateway(message = 'Upstream service failed.', options) {
    return new ApiError(502, message, options);
  }

  static serviceUnavailable(message = 'Service unavailable.', options) {
    return new ApiError(503, message, options);
  }

  static gatewayTimeout(message = 'Upstream service timed out.', options) {
    return new ApiError(504, message, options);
  }
}

/** Wraps an async route handler so rejected promises reach the error middleware. */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
