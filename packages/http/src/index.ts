/**
 * @superfunctions/http - Framework-agnostic HTTP abstraction layer
 */

// Core router
export { createRouter } from './router.js';

// Types
export type {
  Router,
  RouterOptions,
  Route,
  HttpRouteMeta,
  AuthRouteMeta,
  OpenApiRouteMeta,
  SetCookieInput,
  CookieSameSite,
  RouteHandler,
  RouteContext,
  Middleware,
  MatchedRoute,
  HttpMethod,
  CorsOptions,
  HttpTransportAuthOptions,
  HttpTransportAuthPlugin,
  HttpTransportAuthProvider,
  HttpTransportAuthRetryDecision,
  HttpTransportErrorEvent,
} from './types.js';

// Errors
export {
  RouterError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  MethodNotAllowedError,
  ConflictError,
  UnprocessableEntityError,
  TooManyRequestsError,
  InternalServerError,
  NotImplementedError,
  ServiceUnavailableError,
} from './errors.js';

// Utilities (exported for advanced use cases)
export {
  compilePattern,
  matchPath,
  normalizePath,
  joinPaths,
} from './path-matcher.js';

export {
  createRouteContext,
  mergeContexts,
} from './context.js';

export {
  executeMiddlewareChain,
  combineMiddleware,
} from './middleware.js';

export {
  parseCookieHeader,
  parseCookies,
  serializeSetCookie,
  assertValidRouteMeta,
} from './cookies.js';

export {
  applyMetricHeaders,
  applyObservationHeaders,
  createObservabilityMiddleware,
  formatServerTiming,
  runObservedRequest,
  resolveObservability,
} from './observability.js';
export type {
  ObservationHeaderOptions,
  RequestObservabilityMiddlewareOptions,
  RunObservedRequestOptions,
  ServerTimingOptions,
} from './observability.js';
