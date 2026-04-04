import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const releasePackagesPath = path.join(repoRoot, 'release-packages.json');
const tagPattern = /^(?<slug>[a-z0-9][a-z0-9-]*)-v(?<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function loadReleaseTargets() {
  const raw = await readFile(releasePackagesPath, 'utf8');
  const releasePackages = JSON.parse(raw);

  if (!Array.isArray(releasePackages)) {
    fail(`Expected ${path.relative(repoRoot, releasePackagesPath)} to contain an array`);
  }

  const targets = [];

  for (const entry of releasePackages) {
    if (!entry?.slug || !entry?.path || !entry?.name) {
      fail(`Invalid release target entry in ${path.relative(repoRoot, releasePackagesPath)}: ${JSON.stringify(entry)}`);
    }

    const packageJsonFile = path.join(repoRoot, entry.path, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonFile, 'utf8'));

    if (packageJson.name !== entry.name) {
      fail(
        `Release target ${entry.slug} expected ${entry.name} at ${entry.path}/package.json, found ${packageJson.name ?? 'undefined'}`,
      );
    }

    targets.push({
      slug: entry.slug,
      name: entry.name,
      version: packageJson.version,
      path: entry.path,
    });
  }

  return targets;
}

async function writeOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (!tag) {
  fail('Expected a release tag argument or GITHUB_REF_NAME');
}

const match = tag.match(tagPattern);

if (!match?.groups) {
  fail(`Unsupported tag format: ${tag}. Expected <package-slug>-v<version>.`);
}

const { slug, version } = match.groups;
const releaseTargets = await loadReleaseTargets();
const target = releaseTargets.find((candidate) => candidate.slug === slug);

if (!target) {
  const supportedSlugs = releaseTargets.map((target) => target.slug).join(', ');
  fail(`No publishable workspace found for slug "${slug}". Supported slugs: ${supportedSlugs}`);
}

if (target.version !== version) {
  fail(`Tag version ${version} does not match ${target.name}@${target.version} in ${target.path}/package.json`);
}

await writeOutputs({
  pkg_slug: target.slug,
  pkg_name: target.name,
  pkg_version: target.version,
  pkg_path: target.path,
});

console.log(
  JSON.stringify(
    {
      tag,
      slug: target.slug,
      name: target.name,
      version: target.version,
      path: target.path,
    },
    null,
    2,
  ),
);
