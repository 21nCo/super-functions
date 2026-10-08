import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const number = '(?:0|[1-9][0-9]*)';
const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
const versionPattern = `${number}\\.${number}\\.${number}(?:-(${identifier}(?:\\.${identifier})*))?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?`;
const tagPattern = new RegExp(`^([a-z0-9][a-z0-9-]*)-v(${versionPattern})$`);

export async function resolveReleaseTag(tag, { root = repoRoot } = {}) {
  const match = typeof tag === 'string' && tag.match(tagPattern);
  if (!match) throw new Error(`Unsupported tag format: ${tag}. Expected <package-slug>-v<strict-semver>.`);
  const [, slug, version, prerelease] = match;
  const distTag = prerelease ? prerelease.split('.')[0] : 'latest';
  // npm rejects dist-tags that parse as version ranges; prereleases must never
  // move latest, even when someone names the prerelease "latest".
  if (prerelease && (!/^[a-z][a-z0-9-]*$/.test(distTag) || /^(?:v[0-9]|x$)/.test(distTag) || distTag === 'latest')) {
    throw new Error(`Unsafe prerelease dist-tag: ${distTag}`);
  }
  const targets = JSON.parse(await readFile(path.join(root, 'release-packages.json'), 'utf8'));
  if (!Array.isArray(targets)) throw new Error('Expected release-packages.json to contain an array');
  const slugs = new Set();
  const names = new Set();
  for (const entry of targets) {
    if (!entry?.slug || !entry?.name || !entry?.path || slugs.has(entry.slug) || names.has(entry.name)) {
      throw new Error(`Invalid or duplicate release target: ${JSON.stringify(entry)}`);
    }
    const relative = path.relative(root, path.resolve(root, entry.path));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Invalid target path: ${entry.path}`);
    slugs.add(entry.slug);
    names.add(entry.name);
  }
  const target = targets.find(candidate => candidate.slug === slug);
  if (!target) throw new Error(`No publishable workspace found for slug "${slug}"`);
  const manifest = JSON.parse(await readFile(path.join(root, target.path, 'package.json'), 'utf8'));
  if (manifest.private === true) throw new Error(`Cannot publish private package ${target.name}`);
  if (manifest.name !== target.name) throw new Error(`Release target ${slug} expected ${target.name}, found ${manifest.name}`);
  if (manifest.version !== version) throw new Error(`Tag version ${version} does not match ${target.name}@${manifest.version}`);
  if (manifest.publishConfig?.tag && manifest.publishConfig.tag !== distTag) {
    throw new Error(`publishConfig.tag ${manifest.publishConfig.tag} conflicts with resolved dist-tag ${distTag}`);
  }
  return { tag, slug, name: target.name, version, path: target.path, distTag };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await resolveReleaseTag(process.argv[2] ?? process.env.GITHUB_REF_NAME);
    if (process.env.GITHUB_OUTPUT) {
      const outputs = { pkg_slug: result.slug, pkg_name: result.name, pkg_version: result.version, pkg_path: result.path, dist_tag: result.distTag };
      await appendFile(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''));
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
