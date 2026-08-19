import type { HttpClient, HttpResponse, RequestConfig } from '../types/action.js';

export class FetchHttpClient implements HttpClient {
  private baseTimeout: number;

  constructor(timeout = 30000) {
    this.baseTimeout = timeout;
  }

  async get<T = any>(url: string, config?: RequestConfig): Promise<HttpResponse<T>> {
    return this.request('GET', url, undefined, config);
  }

  async post<T = any>(url: string, data?: any, config?: RequestConfig): Promise<HttpResponse<T>> {
    return this.request('POST', url, data, config);
  }

  async put<T = any>(url: string, data?: any, config?: RequestConfig): Promise<HttpResponse<T>> {
    return this.request('PUT', url, data, config);
  }

  async patch<T = any>(url: string, data?: any, config?: RequestConfig): Promise<HttpResponse<T>> {
    return this.request('PATCH', url, data, config);
  }

  async delete<T = any>(url: string, config?: RequestConfig): Promise<HttpResponse<T>> {
    return this.request('DELETE', url, undefined, config);
  }

  private async request<T>(
    method: string,
    url: string,
    data?: any,
    config?: RequestConfig
  ): Promise<HttpResponse<T>> {
    const timeout = config?.timeout || this.baseTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const query = serializeQueryParams(config?.params);
      const finalUrl = query ? `${url}?${query}` : url;

      const headers: Record<string, string> = {
        ...(config?.headers ?? {}),
      };

      const body = this.serializeBody(method, data, headers, config?.bodyEncoding);

      const response = await fetch(finalUrl, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let responseData: T;
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        responseData = (await response.json()) as T;
      } else {
        responseData = (await response.text()) as any;
      }

      if (!response.ok) {
        throw new HttpError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          responseData
        );
      }

      return {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }

      throw error;
    }
  }

  private serializeBody(
    method: string,
    data: any,
    headers: Record<string, string>,
    bodyEncoding?: RequestConfig['bodyEncoding']
  ): any {
    if (data === undefined || method === 'GET' || method === 'HEAD') {
      return undefined;
    }

    if (isFormDataInstance(data)) {
      removeHeader(headers, 'content-type');
      return data;
    }

    const explicitContentType = getHeader(headers, 'content-type')?.toLowerCase();
    const resolvedEncoding = bodyEncoding ?? inferEncoding(explicitContentType, data);

    if (resolvedEncoding === 'form') {
      if (!explicitContentType) {
        setHeader(headers, 'Content-Type', 'application/x-www-form-urlencoded');
      }
      return serializeFormPayload(data);
    }

    if (resolvedEncoding === 'json') {
      if (!explicitContentType) {
        setHeader(headers, 'Content-Type', 'application/json');
      }
      if (typeof data === 'string') {
        return data;
      }
      return JSON.stringify(data);
    }

    if (typeof data === 'string') {
      return data;
    }

    if (data instanceof URLSearchParams) {
      return data.toString();
    }

    if (isArrayBuffer(data) || isArrayBufferView(data) || isBlobInstance(data)) {
      return data;
    }

    return String(data);
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function inferEncoding(contentType: string | undefined, data: unknown): 'json' | 'form' | 'raw' {
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    return 'form';
  }

  if (contentType?.includes('application/json')) {
    return 'json';
  }

  if (typeof data === 'string' || data instanceof URLSearchParams) {
    return 'raw';
  }

  if (isFormDataInstance(data)) {
    return 'raw';
  }

  return 'json';
}

function serializeQueryParams(params: Record<string, unknown> | undefined): string | undefined {
  if (!params) {
    return undefined;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry === undefined || entry === null) {
          continue;
        }
        searchParams.append(key, String(entry));
      }
      continue;
    }

    searchParams.set(key, String(value));
  }

  const serialized = searchParams.toString();
  return serialized.length > 0 ? serialized : undefined;
}

function serializeFormPayload(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  if (data instanceof URLSearchParams) {
    return data.toString();
  }

  if (data && typeof data === 'object') {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value === undefined || value === null) {
        continue;
      }
      params.set(key, String(value));
    }
    return params.toString();
  }

  throw new Error('Form encoding requires object, URLSearchParams, or string payload');
}

function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const key = findHeaderKey(headers, name);
  return key ? headers[key] : undefined;
}

function setHeader(headers: Record<string, string>, name: string, value: string): void {
  const key = findHeaderKey(headers, name);
  if (key) {
    headers[key] = value;
    return;
  }
  headers[name] = value;
}

function removeHeader(headers: Record<string, string>, name: string): void {
  const key = findHeaderKey(headers, name);
  if (key) {
    delete headers[key];
  }
}

function findHeaderKey(headers: Record<string, string>, name: string): string | undefined {
  const normalized = name.toLowerCase();
  return Object.keys(headers).find((key) => key.toLowerCase() === normalized);
}

function isArrayBuffer(data: unknown): data is ArrayBuffer {
  return typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer;
}

function isArrayBufferView(data: unknown): data is ArrayBufferView {
  return typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(data);
}

function isBlobInstance(data: unknown): data is Blob {
  return typeof Blob !== 'undefined' && data instanceof Blob;
}

function isFormDataInstance(data: unknown): data is FormData {
  return typeof FormData !== 'undefined' && data instanceof FormData;
}
