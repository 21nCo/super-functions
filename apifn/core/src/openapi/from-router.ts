import { introspectRouter } from "../introspect.js";
import type { IntrospectOptions, OpenAPIDocument, OpenAPIGenerateOptions, Router } from "../types.js";
import { generateOpenAPI } from "./generate.js";

export type FromRouterOptions = OpenAPIGenerateOptions & IntrospectOptions;

export function fromRouter(
  router: Router<unknown>,
  options: FromRouterOptions
): OpenAPIDocument {
  const routes = introspectRouter(router, {
    include: options.include,
    exclude: options.exclude,
    basePath: options.basePath,
  });

  return generateOpenAPI(routes, options);
}
