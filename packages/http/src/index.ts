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
  RouteHandler,
  RouteContext,
  Middleware,
  MatchedRoute,
  HttpMethod,
  CorsOptions,
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
