/**
 * Build a URL with path parameters
 */
export function buildUrl(baseUrl: string, path: string, pathParams?: Record<string, string>): string {
  let url = `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  
  if (pathParams) {
    Object.entries(pathParams).forEach(([key, value]) => {
      url = url.replace(`:${key}`, encodeURIComponent(value));
    });
  }
  
  return url;
}

/**
 * Add query parameters to a URL
 */
export function addQueryParams(url: string, params: Record<string, any>): string {
  const urlObj = new URL(url);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        value.forEach((v) => urlObj.searchParams.append(key, String(v)));
      } else {
        urlObj.searchParams.append(key, String(value));
      }
    }
  });
  
  return urlObj.toString();
}

/**
 * Parse query string from URL
 */
export function parseQueryString(url: string): Record<string, string> {
  const urlObj = new URL(url);
  const params: Record<string, string> = {};
  
  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  
  return params;
}

