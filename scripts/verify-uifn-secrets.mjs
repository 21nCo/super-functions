#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const failures = [];
const roots = [
  'uifn/.conduct/SFN-15',
  'uifn/README.md',
  'uifn/adapter-kit/README.md',
  'uifn/components/README.md',
  'uifn/core/README.md',
  'uifn/examples/README.md',
  'uifn/patterns/README.md',
  'uifn/react/README.md',
  'uifn/recipes/README.md',
  'uifn/registry/README.md',
  'uifn/sf/README.md',
  'uifn/solid/README.md',
  'uifn/storybook/README.md',
  'uifn/svelte/README.md',
  'uifn/theme-tailwind/README.md',
  'uifn/theme/README.md',
  'uifn/tokens/README.md',
  'uifn/components/fixtures',
  'uifn/components/stories',
  'uifn/components/registry',
  'uifn/patterns/fixtures',
  'uifn/patterns/stories',
  'uifn/sf/src',
  'uifn/sf/fixtures',
  'uifn/sf/stories',
  'uifn/storybook/src',
  'uifn/registry/src',
  'uifn/registry/catalog',
  'uifn/registry/docs',
];

const liveSecretPattern = new RegExp(`${['sk', 'live'].join('_')}_[a-z0-9_]+`, 'i');
const readableExtensions = new Set(['.cjs', '.css', '.js', '.json', '.md', '.mjs', '.mts', '.svelte', '.ts', '.tsx', '.yml', '.yaml']);
const forbiddenPatterns = [
  { code: 'UIFN_SECRET_TOKEN_LITERAL', pattern: liveSecretPattern },
  { code: 'UIFN_SECRET_LOCAL_PATH', pattern: /\/(?:tmp|private|home|workspace|var|opt|Volumes)\/[^\s"',)]+|[A-Za-z]:\\/ },
  { code: 'UIFN_SECRET_UPLOAD_URL', pattern: /https?:\/\/[^"'\s]*upload[^"'\s]*/i },
  { code: 'UIFN_SECRET_PII_EMAIL', pattern: /[A-Z0-9._%+-]+@(?!example\.invalid\b)[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { code: 'UIFN_SECRET_GLOBAL_CLIENT', pattern: /globalThis\.authfn|localStorage\.authToken|process\.env\.AUTHFN_TOKEN/ },
  { code: 'UIFN_SECRET_RAW_FILE_PAYLOAD', pattern: /\b(rawFile|rawFiles|rawFileContents|fileContents)\b/i },
];

function file(pathname) {
  return path.join(repoRoot, pathname);
}

function walk(pathname) {
  const absolute = file(pathname);
  if (!existsSync(absolute)) {
    return [];
  }

  const stat = statSync(absolute);
  if (stat.isFile()) {
    return readableExtensions.has(path.extname(pathname)) ? [pathname] : [];
  }

  return readdirSync(absolute)
    .filter((entry) => !['node_modules', 'dist', '.vite-vitest'].includes(entry))
    .flatMap((entry) => walk(path.join(pathname, entry)));
}

for (const root of roots) {
  for (const pathname of walk(root)) {
    const source = readFileSync(file(pathname), 'utf8');
    for (const { code, pattern } of forbiddenPatterns) {
      if (pattern.test(source)) {
        failures.push({ code, path: pathname });
      }
    }
  }
}

const sharedSource = readFileSync(file('uifn/sf/src/shared.ts'), 'utf8');
for (const token of ['[REDACTED]', '[REDACTED_LOCAL_PATH]', '[REDACTED_PII]']) {
  if (!sharedSource.includes(token)) {
    failures.push({ code: 'UIFN_SECRET_REDACTION_TOKEN_MISSING', token });
  }
}

const diagnosticsSource = readFileSync(file('uifn/registry/src/diagnostics.ts'), 'utf8');
for (const token of ['[REDACTED]', '[REDACTED_LOCAL_PATH]', '[REDACTED_PII]']) {
  if (!diagnosticsSource.includes(token)) {
    failures.push({ code: 'UIFN_SECRET_CLI_REDACTION_TOKEN_MISSING', token });
  }
}

const releaseSource = readFileSync(file('scripts/verify-uifn-release.mjs'), 'utf8');
for (const token of ['[REDACTED]', '[REDACTED_LOCAL_PATH]', '[REDACTED_PII]', 'function sanitize']) {
  if (!releaseSource.includes(token)) {
    failures.push({ code: 'UIFN_SECRET_RELEASE_REDACTION_MISSING', token });
  }
}
if (!releaseSource.includes('[a-z0-9_-]+')) {
  failures.push({ code: 'UIFN_SECRET_RELEASE_BASE64URL_REDACTION_MISSING' });
}
if (!releaseSource.includes('Users|root|tmp|private|home|workspace|var|opt|Volumes')) {
  failures.push({ code: 'UIFN_SECRET_RELEASE_LOCAL_ROOT_REDACTION_MISSING' });
}

const storybookDecoratorSource = readFileSync(file('uifn/storybook/src/decorators/sf-mocks.ts'), 'utf8');
if (!storybookDecoratorSource.includes("type: 'fake'") || !storybookDecoratorSource.includes('tenant_demo')) {
  failures.push({ code: 'UIFN_SECRET_STORYBOOK_FAKE_CREDENTIALS_MISSING' });
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-secrets', failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      command: 'verify:uifn-secrets',
      redaction: ['token', 'local-path', 'pii-email'],
      fakeStorybookCredentials: true,
      scannedRoots: roots,
      scannedFiles: roots.flatMap((root) => walk(root)).length,
      releaseOutputSanitizer: true,
      cliDiagnosticsSanitizer: true,
      forbiddenReads: [],
    },
    null,
    2
  )
);
