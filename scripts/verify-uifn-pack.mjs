#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const npmCacheDir = mkdtempSync(path.join(tmpdir(), 'uifn-pack-npm-cache-'));
const packageGraph = JSON.parse(readFileSync(path.join(repoRoot, 'uifn', 'package-graph.json'), 'utf8'));
const targetPackages = packageGraph.stable.map((entry) => entry.name);
const packageJsonFiles = packageGraph.stable.map((entry) => `${entry.path}/package.json`);
const failures = [];

function readJson(pathname) {
  return JSON.parse(readFileSync(path.join(repoRoot, pathname), 'utf8'));
}

function packageDir(packageName) {
  const match = packageJsonFiles.find((file) => readJson(file).name === packageName);
  return match ? path.dirname(match) : undefined;
}

function sanitize(value) {
  return String(value)
    .replaceAll(repoRoot, '[REDACTED_LOCAL_PATH]')
    .replace(/\/(?:tmp|private|home|workspace|var|opt|Volumes)\/[^\s"',)]+/g, '[REDACTED_LOCAL_PATH]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_PII]');
}

function tail(value) {
  return sanitize(value).split('\n').slice(-16).join('\n').trim();
}

function parsePackOutput(stdout) {
  const source = String(stdout).trim();
  for (let index = source.lastIndexOf('['); index >= 0; index = source.lastIndexOf('[', index - 1)) {
    try {
      const parsed = JSON.parse(source.slice(index));
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function exportTargets(exportsField) {
  const targets = new Set();
  const visit = (value) => {
    if (typeof value === 'string' && value.startsWith('./')) {
      targets.add(value.slice(2));
      return;
    }

    if (value && typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };

  visit(exportsField);
  return Array.from(targets);
}

function wildcardToRegExp(target) {
  return new RegExp(`^${target.split('*').map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')).join('[^/]+')}$`);
}

function assertNoForbiddenPackPath(packageName, filePath) {
  const forbiddenPatterns = [
    { code: 'UIFN_PACK_TEST_LEAK', pattern: /(^|\/)(__tests__|tests?|test-fixtures)\// },
    { code: 'UIFN_PACK_TEST_LEAK', pattern: /\.(test|spec)\.[cm]?[jt]sx?$/ },
    { code: 'UIFN_PACK_FIXTURE_LEAK', pattern: /(^|\/)(fixtures?|stories?|storybook-fixtures)\// },
    { code: 'UIFN_PACK_CONDUCT_LEAK', pattern: /^\.conduct\// },
    { code: 'UIFN_PACK_CACHE_LEAK', pattern: /(^|\/)(node_modules|\.vite|\.svelte-kit|coverage|tmp)\// },
    { code: 'UIFN_PACK_CONFIG_LEAK', pattern: /(^|\/)(tsconfig|vitest|playwright|eslint|prettier)[^/]*\.(json|js|mjs|cjs|ts)$/ },
    { code: 'UIFN_PACK_ENV_LEAK', pattern: /(^|\/)\.env(\.|$)/ },
    { code: 'UIFN_PACK_LOG_LEAK', pattern: /\.(log|tmp)$/ },
  ];

  if (path.isAbsolute(filePath) || filePath.includes('..')) {
    failures.push({ code: 'UIFN_PACK_PATH_UNSAFE', package: packageName, path: filePath });
  }

  for (const { code, pattern } of forbiddenPatterns) {
    if (pattern.test(filePath)) {
      failures.push({ code, package: packageName, path: filePath });
    }
  }
}

function verifyPackage(packageName) {
  const dir = packageDir(packageName);
  if (!dir) {
    failures.push({ code: 'UIFN_PACK_PACKAGE_MISSING', package: packageName });
    return undefined;
  }

  const result = spawnSync('npm', ['pack', '--workspace', packageName, '--dry-run', '--json'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: npmCacheDir,
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    failures.push({
      code: 'UIFN_PACK_COMMAND_FAILED',
      package: packageName,
      status: result.status,
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
    });
    return undefined;
  }

  const parsed = parsePackOutput(result.stdout);
  const pack = parsed?.find((entry) => entry.name === packageName) ?? parsed?.[0];
  if (!pack || !Array.isArray(pack.files)) {
    failures.push({
      code: 'UIFN_PACK_JSON_MISSING',
      package: packageName,
      stdoutTail: tail(result.stdout),
    });
    return undefined;
  }

  const packageJson = readJson(`${dir}/package.json`);
  const filePaths = pack.files.map((file) => file.path);
  const fileSet = new Set(filePaths);
  const requiredFiles = new Set([
    'package.json',
    'README.md',
    packageJson.main,
    packageJson.module,
    packageJson.types,
    ...exportTargets(packageJson.exports),
  ].filter(Boolean).map((target) => target.startsWith('./') ? target.slice(2) : target));

  for (const requiredFile of requiredFiles) {
    if (requiredFile.includes('*')) {
      const matcher = wildcardToRegExp(requiredFile);
      if (!filePaths.some((filePath) => matcher.test(filePath))) {
        failures.push({
          code: 'UIFN_PACK_REQUIRED_GLOB_MISSING',
          package: packageName,
          path: requiredFile,
        });
      }
      continue;
    }

    if (!fileSet.has(requiredFile)) {
      failures.push({
        code: 'UIFN_PACK_REQUIRED_FILE_MISSING',
        package: packageName,
        path: requiredFile,
      });
    }
  }

  if (filePaths.length === 0) {
    failures.push({ code: 'UIFN_PACK_EMPTY', package: packageName });
  }

  filePaths.forEach((filePath) => assertNoForbiddenPackPath(packageName, filePath));

  return {
    package: packageName,
    filename: pack.filename,
    fileCount: filePaths.length,
    unpackedSize: pack.unpackedSize,
  };
}

const packages = targetPackages.map(verifyPackage).filter(Boolean);
rmSync(npmCacheDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        command: 'verify-uifn-pack',
        failures,
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      command: 'verify-uifn-pack',
      packages,
      forbiddenPathClasses: [
        'tests',
        'fixtures',
        'stories',
        'conduct',
        'cache',
        'tool-config',
        'env',
        'logs',
      ],
    },
    null,
    2
  )
);
