/**
 * Context helpers for request handling
 */

import type { RouteContext } from './types.js';
import { PayloadTooLargeError } from './errors.js';

/**
 * Read a request body fully while enforcing a maximum byte length.
 *
 * Rejects early via the Content-Length header when present, and otherwise
 * streams the body and aborts as soon as the accumulated size exceeds the
 * limit — so an attacker cannot exhaust memory by omitting Content-Length.
 */
async function readBodyBufferWithLimit(
  request: Request,
  maxBodyBytes: number
): Promise<Uint8Array> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBodyBytes) {
      throw new PayloadTooLargeError(
        `Request body exceeds the maximum allowed size of ${maxBodyBytes} bytes`,
        'PAYLOAD_TOO_LARGE'
      );
    }
  }

  const body = request.body;
  // No stream available (e.g. an already-buffered mock): fall back to
  // arrayBuffer() so multipart and other binary payloads are not corrupted.
  if (!body) {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > maxBodyBytes) {
      throw new PayloadTooLargeError(
        `Request body exceeds the maximum allowed size of ${maxBodyBytes} bytes`,
        'PAYLOAD_TOO_LARGE'
      );
    }
    return bytes;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBodyBytes) {
          // Stop the producer immediately. Releasing the lock alone leaves the
          // source free to continue buffering an attacker-controlled body.
          try {
            await reader.cancel('PAYLOAD_TOO_LARGE');
          } catch {
            // Preserve the stable payload-limit error even if cancellation
            // itself fails in a custom stream implementation.
          }
          throw new PayloadTooLargeError(
            `Request body exceeds the maximum allowed size of ${maxBodyBytes} bytes`,
            'PAYLOAD_TOO_LARGE'
          );
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return concatChunks(chunks, total);
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Create a RouteContext from a Request and path params
 */
export function createRouteContext(
  request: Request,
  params: Record<string, string>,
  options?: { maxBodyBytes?: number }
): RouteContext {
  const url = new URL(request.url);
  const query = url.searchParams;
  const maxBodyBytes = options?.maxBodyBytes;

  // Cache for parsed bodies to avoid multiple parsing
  let jsonCache: Promise<any> | null = null;
  let textCache: Promise<string> | null = null;
  let formDataCache: Promise<FormData> | null = null;
  let bodyBufferCache: Promise<Uint8Array> | null = null;

  // When a limit is configured, buffer the body once (with enforcement) and
  // derive json/text/formData from that single read. Otherwise defer to the
  // native Request parsers.
  const readBuffer = (): Promise<Uint8Array> => {
    if (!bodyBufferCache) {
      bodyBufferCache = readBodyBufferWithLimit(request, maxBodyBytes!);
    }
    return bodyBufferCache;
  };

  const readText = (): Promise<string> => {
    if (!textCache) {
      textCache =
        maxBodyBytes !== undefined
          ? readBuffer().then((bytes) => new TextDecoder().decode(bytes))
          : request.text();
    }
    return textCache;
  };

  return {
    params,
    query,
    url,

    json: async <T = any>(): Promise<T> => {
      if (!jsonCache) {
        jsonCache =
          maxBodyBytes !== undefined
            ? readText().then((text) => JSON.parse(text))
            : request.json();
      }
      return jsonCache as Promise<T>;
    },

    text: async (): Promise<string> => {
      return readText();
    },

    formData: async (): Promise<FormData> => {
      if (!formDataCache) {
        if (maxBodyBytes !== undefined) {
          formDataCache = readBuffer().then((bytes) => {
            // Parse from the same bounded binary buffer used by json() and
            // text(). Response.formData() preserves multipart file bytes.
            return new Response(bytes.buffer as ArrayBuffer, { headers: request.headers }).formData();
          });
        } else {
          formDataCache = request.formData();
        }
      }
      return formDataCache;
    },
  };
}

/**
 * Merge user context with route context
 */
export function mergeContexts<TContext>(
  userContext: TContext,
  routeContext: RouteContext
): TContext & RouteContext {
  return {
    ...userContext,
    ...routeContext,
  };
}
