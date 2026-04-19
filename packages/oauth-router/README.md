# @superfunctions/oauth-router

Reusable OAuth route factories for browser-auth and connection-management flows.

## Install

```bash
npm install @superfunctions/oauth-router @superfunctions/oauth-flow @superfunctions/http
```

Use an HTTP adapter such as `@superfunctions/http-express`, `@superfunctions/http-fastify`, or `@superfunctions/http-hono` in the consuming app.

## Quick Start

```ts
import { createOAuthBrowserRoutes } from "@superfunctions/oauth-router";

const routes = createOAuthBrowserRoutes({
  basePath: "/auth/social",
  flowService,
  async resolveStartInput(request) {
    return (await request.json()) as never;
  },
});
```

## Package Boundary

`@superfunctions/oauth-router` owns route factories only:

- `createOAuthBrowserRoutes(...)`
- `createOAuthConnectionRoutes(...)`
- secure default route metadata
- per-route `routeMeta` overrides

It does not create framework servers, resolve sessions, or persist OAuth state by itself.

## Production Notes

- Browser routes default to `start=none`, `callback=none`, `disconnect=hybrid`.
- Connection routes default to `start=hybrid`, `callback=none`, `disconnect=hybrid`.
- Override route metadata explicitly when your app requires stronger auth or different OpenAPI annotations.
- Keep callback routes reachable without session enforcement unless your app handles provider callbacks through another trust boundary.

## Related Packages

- OAuth core primitives: [../oauth-core/README.md](../oauth-core/README.md)
- Flow orchestration: [../oauth-flow/README.md](../oauth-flow/README.md)
- HTTP primitives: [../oauth-http/README.md](../oauth-http/README.md)
