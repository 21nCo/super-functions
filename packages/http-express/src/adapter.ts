/**
 * Express adapter for @superfunctions/http
 */

import type { Router } from '@superfunctions/http';
import express from 'express';

/**
 * Convert a @superfunctions/http Router to an Express RequestHandler
 * 
 * Usage:
 * ```typescript
 * const router = createRouter({ routes: [...] });
 * app.use('/api', toExpress(router));
 * ```
 */
export function toExpress(router: Router): express.RequestHandler {
  return async (req, res, next) => {
    try {
      // Convert Express Request to Web Standard Request
      const webRequest = await convertToWebRequest(req);
      
      // Handle with router
      const webResponse = await router.handle(webRequest);
      
      // Convert Web Response to Express Response
      await convertToExpressResponse(webResponse, res);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Convert Express Request to Web Standard Request
 */
async function convertToWebRequest(req: express.Request): Promise<Request> {
  // Build full URL
  // Use req.url (not originalUrl) to get path relative to router mount point
  const protocol = req.protocol;
  const host = req.get('host') || 'localhost';
  const url = `${protocol}://${host}${req.url}`;

  // Convert headers
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v));
      } else {
        headers.set(key, value);
      }
    }
  }

  // Handle body
  let body: BodyInit | null = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // If body is already parsed (e.g., by express.json() middleware)
    if (req.body && Object.keys(req.body).length > 0) {
      body = JSON.stringify(req.body);
      // Ensure Content-Type is set
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    }
  }

  return new Request(url, {
    method: req.method,
    headers,
    body,
  });
}

/**
 * Convert Web Standard Response to Express Response
 */
async function convertToExpressResponse(
  webResponse: Response,
  expressResponse: express.Response
): Promise<void> {
  // Set status
  expressResponse.status(webResponse.status);

  // Set status text if available
  if (webResponse.statusText) {
    expressResponse.statusMessage = webResponse.statusText;
  }

  const { headers, setCookies } = collectResponseHeaders(webResponse.headers);
  if (setCookies.length > 0) {
    expressResponse.setHeader('set-cookie', setCookies);
  }

  // Set headers
  headers.forEach(([key, value]) => {
    expressResponse.setHeader(key, value);
  });

  // Send body
  if (webResponse.body) {
    const text = await webResponse.text();
    expressResponse.send(text);
  } else {
    expressResponse.end();
  }
}

function collectResponseHeaders(
  headers: Headers
): { headers: Array<[string, string]>; setCookies: string[] } {
  const maybeHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const supportsGetSetCookie = typeof maybeHeaders.getSetCookie === 'function';
  const setCookies = supportsGetSetCookie ? maybeHeaders.getSetCookie() : [];
  const headerEntries: Array<[string, string]> = [];

  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      if (!supportsGetSetCookie) {
        setCookies.push(value);
      }
      return;
    }

    headerEntries.push([key, value]);
  });

  return { headers: headerEntries, setCookies };
}
