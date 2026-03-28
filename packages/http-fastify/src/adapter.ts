/**
 * Fastify adapter for @superfunctions/http
 */

import type { Router } from '@superfunctions/http';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Convert a @superfunctions/http Router to a Fastify plugin
 * 
 * Usage:
 * ```typescript
 * fastify.register(toFastify(router), { prefix: '/api' });
 * ```
 */
export function toFastify(router: Router): FastifyPluginAsync {
  const plugin: FastifyPluginAsync = async (fastify: FastifyInstance, opts: any) => {
    const prefix = opts.prefix || '';
    
    // Catch all route that delegates to the router
    fastify.all('/*', async (request: FastifyRequest, reply: FastifyReply) => {
      // Convert Fastify Request to Web Standard Request
      // Strip the prefix from the URL so router can match correctly
      const webRequest = await convertToWebRequest(request, prefix);

      // Handle with router (router will do the routing)
      const webResponse = await router.handle(webRequest);

      // Convert Web Response to Fastify Reply
      await convertToFastifyReply(webResponse, reply);
    });
  };

  return plugin;
}

/**
 * Convert Fastify Request to Web Standard Request
 */
async function convertToWebRequest(request: FastifyRequest, prefix: string = ''): Promise<Request> {
  // Build full URL
  // Strip prefix from URL so router can match routes correctly
  let path = request.url;
  if (prefix && path.startsWith(prefix)) {
    path = path.slice(prefix.length) || '/';
  }
  
  const protocol = request.protocol;
  const host = request.hostname;
  const url = `${protocol}://${host}${path}`;

  // Convert headers
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
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
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // Fastify parses body automatically if content-type parser is registered
    if (request.body && Object.keys(request.body as any).length > 0) {
      body = JSON.stringify(request.body);
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    }
  }

  return new Request(url, {
    method: request.method,
    headers,
    body,
  });
}

/**
 * Convert Web Standard Response to Fastify Reply
 */
async function convertToFastifyReply(
  webResponse: Response,
  reply: FastifyReply
): Promise<void> {
  // Set status
  reply.status(webResponse.status);

  const { headers, setCookies } = collectResponseHeaders(webResponse.headers);
  if (setCookies.length > 0) {
    reply.header('set-cookie', setCookies);
  }

  // Set headers
  headers.forEach(([key, value]) => {
    reply.header(key, value);
  });

  // Send body
  if (webResponse.body) {
    const text = await webResponse.text();
    
    // Fastify expects parsed JSON if Content-Type is application/json
    const contentType = webResponse.headers.get('Content-Type');
    if (contentType?.includes('application/json')) {
      try {
        reply.send(JSON.parse(text));
      } catch {
        // If parsing fails, send as text
        reply.send(text);
      }
    } else {
      reply.send(text);
    }
  } else {
    reply.send();
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
