import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverPythonPackages, topologicalLocalDependencies } from './ci-utils.mjs';

test('Python CI installs the transitive dev-adapter closure but not unselected extras', async t => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'python-ci-dependencies-'));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const projects = {
    'base-core': '[project]\nname = "base-core"\n',
    'runtime-db': '[project]\nname = "runtime-db"\ndependencies = ["base-core>=1.0"]\n',
    'adapter-fastapi': '[project]\nname = "adapter-fastapi"\ndependencies = ["base-core>=1.0"]\n',
    'unused-adapter': '[project]\nname = "unused-adapter"\n',
    sdk: `[project]
name = "sdk"
dependencies = ["runtime-db>=1.0"]
[project.optional-dependencies]
dev = [
  "adapter-fastapi[all]>=1.0",
  "pytest>=7.0",
]
cloud = ["unused-adapter>=1.0"]
`,
  };
  for (const [name, manifest] of Object.entries(projects)) {
    await mkdir(path.join(fixture, name));
    await writeFile(path.join(fixture, name, 'pyproject.toml'), manifest);
  }
  const manifests = discoverPythonPackages(fixture);
  const byName = new Map(manifests.map(manifest => [manifest.name, manifest]));
  assert.deepEqual(
    topologicalLocalDependencies('sdk', byName).map(manifest => manifest.name),
    ['base-core', 'runtime-db', 'adapter-fastapi', 'sdk'],
  );
});
