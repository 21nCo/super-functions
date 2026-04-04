import { joinPaths, type Route, type Router } from '@superfunctions/http';
import {
  OpenApiGenerationError,
  generateOpenApiDocument
} from '@superfunctions/http-openapi';
import { AuthFnInternalError } from './core/errors.js';
import type { AuthFnConfig } from './types.js';

export function createAuthFnOpenApiDocument(
  config: Pick<AuthFnConfig, 'basePath' | 'openApi'>,
  router: Pick<Router, 'getRoutes'>
): Record<string, unknown> {
  const metadata = resolveOpenApiMetadata(config);

  try {
    return generateOpenApiDocument({
      title: metadata.title,
      version: metadata.version,
      routers: [withBasePath(router, config.basePath ?? '/auth')]
    });
  } catch (error) {
    if (error instanceof OpenApiGenerationError) {
      throw new AuthFnInternalError('Failed to generate authfn OpenAPI document', {
        code: error.code,
        method: error.details?.method,
        path: error.details?.path
      });
    }

    throw error;
  }
}

function resolveOpenApiMetadata(
  config: Pick<AuthFnConfig, 'openApi'>
): { title: string; version: string } {
  if (typeof config.openApi === 'object') {
    return config.openApi;
  }

  return {
    title: 'AuthFn API',
    version: '0.0.1'
  };
}

function withBasePath(
  router: Pick<Router, 'getRoutes'>,
  basePath: string
): Pick<Router, 'getRoutes'> {
  return {
    getRoutes(): Route[] {
      return router.getRoutes().map((route) => ({
        ...route,
        path: joinPaths(basePath, route.path)
      }));
    }
  };
}
