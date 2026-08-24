export function normalizeCatalogBasePath(basePath: string): string {
  const normalized = `/${String(basePath).split('/').filter(Boolean).join('/')}`;
  return normalized === '/' ? '' : normalized;
}

export function normalizeCatalogInternalPath(pathname: string): string {
  return `/${String(pathname).split('/').filter(Boolean).join('/')}`;
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
