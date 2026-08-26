import catalogManifest from "./dist/catalog-manifest.json";

interface Env {
  ASSETS: Fetcher;
  UIFN_WORKER_BUILD_HASH?: string;
}

const frameworkPrefixes = [
  "/components/react",
  "/components/svelte",
  "/components/solid",
] as const;

const securityHeaders = {
  "x-uifn-catalog-build": catalogManifest.generatedAt,
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' https://cloudflareinsights.com",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
  ].join("; "),
  "cross-origin-opener-policy": "same-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

function secure(response: Response, workerBuildHash: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
  headers.set("x-uifn-catalog-worker", workerBuildHash);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function redirectWithSlash(
  request: Request,
  pathname: string,
  workerBuildHash: string,
): Response | null {
  if (pathname === "/components" || frameworkPrefixes.includes(pathname as never)) {
    const url = new URL(request.url);
    url.pathname = `${pathname}/`;
    return secure(Response.redirect(url, 308), workerBuildHash);
  }
  return null;
}

function catalogPrefix(pathname: string): string | undefined {
  return frameworkPrefixes.find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const workerBuildHash =
      env.UIFN_WORKER_BUILD_HASH ?? `sites-${catalogManifest.generatedAt}`;

    if (url.pathname === "/") {
      url.pathname = "/components/";
      return secure(Response.redirect(url, 302), workerBuildHash);
    }

    const slashRedirect = redirectWithSlash(
      request,
      url.pathname,
      workerBuildHash,
    );
    if (slashRedirect) return slashRedirect;

    if (url.pathname === "/components/") {
      const landingUrl = new URL(request.url);
      landingUrl.pathname = "/components/index.html";
      return secure(
        await env.ASSETS.fetch(new Request(landingUrl, request)),
        workerBuildHash,
      );
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return secure(assetResponse, workerBuildHash);
    }

    const prefix = catalogPrefix(url.pathname);
    if (prefix) {
      const routeUrl = new URL(request.url);
      routeUrl.pathname = `${url.pathname.replace(/\/+$/, "")}/index.html`;
      const route = await env.ASSETS.fetch(new Request(routeUrl, request));
      if (route.status !== 404) {
        return secure(
          new Response(route.body, {
            status: 200,
            headers: route.headers,
          }),
          workerBuildHash,
        );
      }

      const notFoundUrl = new URL(request.url);
      notFoundUrl.pathname = "/components/404.html";
      const notFound = await env.ASSETS.fetch(new Request(notFoundUrl, request));
      return secure(
        new Response(notFound.body, {
          status: 404,
          headers: notFound.headers,
        }),
        workerBuildHash,
      );
    }

    return secure(assetResponse, workerBuildHash);
  },
} satisfies ExportedHandler<Env>;
