import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const npm = process.env.UIFN_NPM_PATH ?? '/opt/homebrew/bin/npm';
export const node = process.env.UIFN_NODE_PATH ?? '/opt/homebrew/bin/node';
export const fixturePath = '/opt/homebrew/bin:/usr/bin:/bin';
export const publicPackages = [
  '@uifn/core', '@uifn/dom', '@uifn/adapter-kit', '@uifn/tokens', '@uifn/theme', '@uifn/recipes',
  '@uifn/components', '@uifn/react', '@uifn/svelte', '@uifn/solid', '@uifn/components-react',
  '@uifn/components-svelte', '@uifn/components-solid', '@uifn/registry', '@uifn/storybook',
];

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const fileSha256 = (pathname) => sha256(readFileSync(pathname));
export const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function write(pathname, contents) {
  mkdirSync(path.dirname(pathname), { recursive: true });
  writeFileSync(pathname, contents);
}

export function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env, PATH: fixturePath },
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    command: [command, ...args].join(' '),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function requirePass(result) {
  if (!result.ok) throw new Error(`${result.command} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
}

function parsePack(stdout) {
  for (let index = stdout.lastIndexOf('['); index >= 0; index = stdout.lastIndexOf('[', index - 1)) {
    try {
      const parsed = JSON.parse(stdout.slice(index));
      if (Array.isArray(parsed) && parsed[0]?.filename) return parsed[0];
    } catch {}
  }
  throw new Error('npm pack did not return JSON metadata.');
}

export function packPublicPackages(root, tarballRoot, selected = publicPackages) {
  mkdirSync(tarballRoot, { recursive: true });
  const tarballs = {};
  for (const packageName of selected) {
    const result = run(npm, ['pack', '--workspace', packageName, '--json', '--ignore-scripts', '--pack-destination', tarballRoot], root);
    requirePass(result);
    const metadata = parsePack(result.stdout);
    const pathname = path.join(tarballRoot, metadata.filename);
    tarballs[packageName] = {
      pathname,
      filename: metadata.filename,
      sha256: fileSha256(pathname),
      fileCount: metadata.files?.length ?? 0,
      unpackedSize: metadata.unpackedSize ?? 0,
    };
  }
  return tarballs;
}

const mime = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.map': 'application/json', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

export async function serveStatic(root) {
  const server = createServer((request, response) => {
    const raw = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const decoded = decodeURIComponent(raw);
    const relative = decoded === '/' ? 'index.html' : decoded.slice(1);
    const normalized = path.normalize(relative);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    let pathname = path.join(root, normalized);
    if (existsSync(pathname) && statSync(pathname).isDirectory()) pathname = path.join(pathname, 'index.html');
    if (!existsSync(pathname) || !statSync(pathname).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': mime[path.extname(pathname)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(pathname).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Static server did not allocate a port.');
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
