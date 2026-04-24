import { err, normalizeLegacyEnvelope, type Envelope } from '@superfunctions/envelope';
import type { BillFnClientOptions } from './types.js';

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  query?: Record<string, string>;
}

export function createBillFnHttpClient(options: BillFnClientOptions = {}) {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? '/billfn').replace(/\/$/, '');
  const credentials = options.credentials ?? 'include';

  return {
    requestJson: async <T>(request: RequestOptions): Promise<Envelope<T>> => {
      let url = `${baseUrl}${request.path}`;
      if (request.query && Object.keys(request.query).length > 0) {
        const params = new URLSearchParams(request.query);
        url = `${url}?${params.toString()}`;
      }

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: request.method,
          credentials,
          headers: request.body === undefined
            ? undefined
            : {
                'content-type': 'application/json'
              },
          body: request.body === undefined ? undefined : JSON.stringify(request.body)
        });
      } catch (error) {
        return err({
          code: 'BILLFN_NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'BillFn request failed before a response was received',
          status: 503,
          retryable: true
        });
      }

      const raw = await response.text();
      if (!raw) {
        return err({
          code: 'BILLFN_EMPTY_RESPONSE',
          message: 'BillFn returned an empty response',
          status: response.status || 500,
          retryable: response.status >= 500
        });
      }

      try {
        const parsed = JSON.parse(raw) as Envelope<T>;
        return normalizeLegacyEnvelope(parsed, {
          defaultStatus: response.status || 500,
          defaultRetryable: response.status >= 500
        });
      } catch {
        return err({
          code: 'BILLFN_INVALID_RESPONSE',
          message: 'BillFn returned a non-JSON response',
          status: response.status || 500,
          retryable: response.status >= 500
        });
      }
    }
  };
}
