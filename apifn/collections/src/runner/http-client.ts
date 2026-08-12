import type {
  CookieJar,
  CookieJarCookie,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpRedirectRecord,
} from "../types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 10;
const CROSS_ORIGIN_REDIRECT_SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
  "x-auth-token",
]);

function toHeadersRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[]>;
  };

  if (typeof withGetSetCookie.getSetCookie === "function") {
    return withGetSetCookie.getSetCookie();
  }

  if (typeof withGetSetCookie.raw === "function") {
    return withGetSetCookie.raw()["set-cookie"] ?? [];
  }

  const combined = headers.get("set-cookie");
  return combined ? splitCombinedSetCookie(combined) : [];
}

function splitCombinedSetCookie(value: string): string[] {
  const result: string[] = [];
  let start = 0;
  let inExpires = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const slice = value.slice(index, index + 8).toLowerCase();
    if (slice === "expires=") {
      inExpires = true;
    }
    if (inExpires && char === ";") {
      inExpires = false;
    }
    if (!inExpires && char === ",") {
      const next = value.slice(index + 1);
      if (/^\s*[^=;,]+\s*=/.test(next)) {
        result.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }
  }

  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

function normalizeDomain(domain: string): string {
  return domain.replace(/^\./, "").toLowerCase();
}

function defaultPath(url: URL): string {
  if (!url.pathname || url.pathname === "/") {
    return "/";
  }
  const index = url.pathname.lastIndexOf("/");
  return index <= 0 ? "/" : url.pathname.slice(0, index);
}

function domainMatches(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  const normalizedDomain = normalizeDomain(domain);
  return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
}

function pathMatches(pathname: string, cookiePath: string): boolean {
  if (cookiePath === "/") {
    return true;
  }
  return pathname === cookiePath || pathname.startsWith(`${cookiePath}/`);
}

function cookieKey(cookie: Pick<CookieJarCookie, "name" | "domain" | "path">): string {
  return `${cookie.domain}\n${cookie.path}\n${cookie.name}`;
}

function removeCrossOriginRedirectHeaders(
  headers: Record<string, string>,
  fromUrl: string,
  toUrl: string
): Record<string, string> {
  if (new URL(fromUrl).origin === new URL(toUrl).origin) {
    return headers;
  }

  return Object.fromEntries(
    Object.entries(headers).filter(([name]) =>
      !CROSS_ORIGIN_REDIRECT_SENSITIVE_HEADERS.has(name.toLowerCase())
    )
  );
}

export function createCookieJar(initialCookies: CookieJarCookie[] = []): CookieJar {
  const cookies = new Map<string, CookieJarCookie>();

  function pruneExpired(now = Date.now()): void {
    for (const [key, cookie] of cookies.entries()) {
      if (cookie.expiresAt !== undefined && cookie.expiresAt <= now) {
        cookies.delete(key);
      }
    }
  }

  for (const cookie of initialCookies) {
    cookies.set(cookieKey(cookie), {
      ...cookie,
      domain: normalizeDomain(cookie.domain),
    });
  }

  return {
    get(name, url) {
      pruneExpired();
      if (url) {
        const parsed = new URL(url);
        const matched = Array.from(cookies.values()).find((cookie) =>
          cookie.name === name &&
          domainMatches(parsed.hostname, cookie.domain) &&
          pathMatches(parsed.pathname, cookie.path) &&
          (!cookie.secure || parsed.protocol === "https:")
        );
        return matched?.value;
      }

      return Array.from(cookies.values()).find((cookie) => cookie.name === name)?.value;
    },
    set(name, value, url = "http://localhost/") {
      const parsed = new URL(url);
      const cookie: CookieJarCookie = {
        name,
        value,
        domain: normalizeDomain(parsed.hostname),
        path: defaultPath(parsed),
      };
      cookies.set(cookieKey(cookie), cookie);
    },
    delete(name, url) {
      pruneExpired();
      if (!url) {
        for (const [key, cookie] of cookies.entries()) {
          if (cookie.name === name) {
            cookies.delete(key);
          }
        }
        return;
      }

      const parsed = new URL(url);
      for (const [key, cookie] of cookies.entries()) {
        if (
          cookie.name === name &&
          domainMatches(parsed.hostname, cookie.domain) &&
          pathMatches(parsed.pathname, cookie.path)
        ) {
          cookies.delete(key);
        }
      }
    },
    clear() {
      cookies.clear();
    },
    getCookieHeader(url) {
      pruneExpired();
      const parsed = new URL(url);
      const values = Array.from(cookies.values())
        .filter((cookie) =>
          domainMatches(parsed.hostname, cookie.domain) &&
          pathMatches(parsed.pathname, cookie.path) &&
          (!cookie.secure || parsed.protocol === "https:")
        )
        .sort((a, b) => b.path.length - a.path.length)
        .map((cookie) => `${cookie.name}=${cookie.value}`);

      return values.length > 0 ? values.join("; ") : undefined;
    },
    storeFromResponse(url, setCookieHeaders) {
      const parsed = new URL(url);
      for (const header of setCookieHeaders) {
        const parts = header.split(";").map((part) => part.trim()).filter(Boolean);
        const [nameValue, ...attributes] = parts;
        if (!nameValue) {
          continue;
        }
        const separator = nameValue.indexOf("=");
        if (separator <= 0) {
          continue;
        }

        const name = nameValue.slice(0, separator);
        const value = nameValue.slice(separator + 1);
        const cookie: CookieJarCookie = {
          name,
          value,
          domain: normalizeDomain(parsed.hostname),
          path: defaultPath(parsed),
        };

        for (const attribute of attributes) {
          const [rawName, ...rawValueParts] = attribute.split("=");
          const attrName = rawName.toLowerCase();
          const attrValue = rawValueParts.join("=");
          if (attrName === "domain" && attrValue) {
            const domain = normalizeDomain(attrValue);
            if (!domainMatches(parsed.hostname, domain)) {
              cookie.domain = "";
              break;
            }
            cookie.domain = domain;
          } else if (attrName === "path" && attrValue) {
            cookie.path = attrValue;
          } else if (attrName === "expires" && attrValue) {
            const expiresAt = Date.parse(attrValue);
            if (!Number.isNaN(expiresAt)) {
              cookie.expiresAt = expiresAt;
            }
          } else if (attrName === "max-age" && attrValue) {
            const maxAge = Number(attrValue);
            if (Number.isFinite(maxAge)) {
              cookie.expiresAt = Date.now() + maxAge * 1000;
            }
          } else if (attrName === "secure") {
            cookie.secure = true;
          } else if (attrName === "httponly") {
            cookie.httpOnly = true;
          } else if (attrName === "samesite" && attrValue) {
            cookie.sameSite = attrValue;
          }
        }

        if (!cookie.domain) {
          continue;
        }

        const key = cookieKey(cookie);
        if (cookie.expiresAt !== undefined && cookie.expiresAt <= Date.now()) {
          cookies.delete(key);
        } else {
          cookies.set(key, cookie);
        }
      }
    },
    toJSON() {
      pruneExpired();
      return Array.from(cookies.values()).map((cookie) => ({ ...cookie }));
    },
  };
}

export interface FetchHttpClientOptions {
  fetchImpl?: typeof fetch;
  cookieJar?: CookieJar;
  followRedirects?: boolean;
  maxRedirects?: number;
}

export function createFetchHttpClient(
  fetchImplOrOptions: typeof fetch | FetchHttpClientOptions = fetch
): HttpClient & { cookieJar: CookieJar } {
  const options: FetchHttpClientOptions =
    typeof fetchImplOrOptions === "function"
      ? { fetchImpl: fetchImplOrOptions }
      : fetchImplOrOptions;
  const fetchImpl = options.fetchImpl ?? fetch;
  const cookieJar = options.cookieJar ?? createCookieJar();

  async function sendOnce(
    request: HttpClientRequest,
    url: string,
    redirects: HttpRedirectRecord[],
    redirectCount: number
  ): Promise<HttpClientResponse> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = request.timeout ?? DEFAULT_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers = { ...request.headers };
      const cookieHeader = cookieJar.getCookieHeader(url);
      if (cookieHeader && !Object.keys(headers).some((name) => name.toLowerCase() === "cookie")) {
        headers.cookie = cookieHeader;
      }

      const response = await fetchImpl(url, {
        method: request.method,
        headers,
        body: request.body,
        signal: controller.signal,
        redirect: "manual",
      });

      const setCookieHeaders = getSetCookieHeaders(response.headers);
      if (setCookieHeaders.length > 0) {
        cookieJar.storeFromResponse(url, setCookieHeaders);
      }

      const duration = Date.now() - startedAt;
      const followRedirects = request.followRedirects ?? options.followRedirects ?? true;
      const maxRedirects = request.maxRedirects ?? options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
      const location = response.headers.get("location");

      if (
        followRedirects &&
        location &&
        response.status >= 300 &&
        response.status < 400
      ) {
        if (redirectCount >= maxRedirects) {
          throw new Error(`Maximum redirects exceeded (${maxRedirects})`);
        }

        const nextUrl = new URL(location, url).toString();
        redirects.push({
          status: response.status,
          url,
          location: nextUrl,
          duration,
        });

        const method = response.status === 303 && request.method.toUpperCase() !== "GET"
          ? "GET"
          : request.method;
        const body = method === "GET" || method === "HEAD" ? undefined : request.body;

        return sendOnce(
          {
            ...request,
            method,
            body,
            headers: removeCrossOriginRedirectHeaders(request.headers, url, nextUrl),
          },
          nextUrl,
          redirects,
          redirectCount + 1
        );
      }

      const body = await response.text();

      return {
        status: response.status,
        headers: toHeadersRecord(response.headers),
        body,
        size: Buffer.byteLength(body, "utf8"),
        duration: Date.now() - startedAt + redirects.reduce((sum, item) => sum + item.duration, 0),
        redirects: redirects.length > 0 ? redirects : undefined,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    cookieJar,
    async send(request: HttpClientRequest): Promise<HttpClientResponse> {
      return sendOnce(request, request.url, [], 0);
    },
  };
}
