export function normalizeCatalogBasePath(basePath: string): string {
  const normalized = `/${basePath}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized === '/' ? '' : normalized;
}

export function normalizeCatalogInternalPath(pathname: string): string {
  const normalized = `/${pathname}`.replace(/\/+/g, '/');
  const withoutTrailingSlash = normalized.length > 1
    ? normalized.replace(/\/+$/, '')
    : normalized;
  return withoutTrailingSlash || '/';
}

export function stripCatalogBasePath(pathname: string, basePath: string): string {
  const normalizedBase = normalizeCatalogBasePath(basePath);
  if (!normalizedBase) return normalizeCatalogInternalPath(pathname);
  if (pathname === normalizedBase || pathname === `${normalizedBase}/`) return '/';
  if (pathname.startsWith(`${normalizedBase}/`)) {
    return normalizeCatalogInternalPath(pathname.slice(normalizedBase.length));
  }
  return normalizeCatalogInternalPath(pathname);
}

export function withCatalogBasePath(basePath: string, internalPath: string): string {
  const normalizedBase = normalizeCatalogBasePath(basePath);
  const internal = normalizeCatalogInternalPath(internalPath);
  const normalizedPath = internal === '/' ? '' : internal;
  return `${normalizedBase}${normalizedPath}` || '/';
}
