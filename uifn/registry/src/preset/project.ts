import { minimatch } from "minimatch";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync } from 'node:fs';
import path from 'node:path';
import { planInstall } from '../plan';
import { checksumContent } from '../lockfile';
import { assertContainedPath, commitTransaction, type TransactionChange } from '../transaction';
import { decodePreset, encodePreset, normalizePreset } from './codec';
import { assertApprovedInit, compilePreset, type PresetCompilePlan } from './compiler';
import { PRESET_REACT_FIXTURE_SOURCE } from './fixture-source';
import { fixtureCss } from './fixtures';
import { presetFixtureTree, PRESET_FIXTURE_COMPONENTS } from './fixture-tree';
import { APPROVED_SUPPORT_MATRIX, type ApprovedTemplate, type PartialPresetDomain, type UIFnPresetV1 } from './schema';
import { presetFailure, UIFnPresetError } from './errors';

export const PRESET_STATE_PATH = '.uifn/preset.json';
export const PRESET_THEME_PATH = 'src/uifn-theme.css';
export const PRESET_APP_PATH = 'src/App.tsx';
export const PRESET_MAIN_PATH = 'src/main.tsx';

export interface PresetProjectState {
  schemaVersion: 1;
  code: string;
  preset: UIFnPresetV1;
  template: ApprovedTemplate;
  files: Record<string, string>;
}

export interface PresetMutationOptions {
  rootDir: string;
  preset?: UIFnPresetV1 | string;
  template?: ApprovedTemplate;
  dryRun?: boolean;
  only?: PartialPresetDomain[];
  faultAfterWrites?: number;
  createRoot?: boolean;
}

type FileOperation = 'create' | 'update' | 'unchanged';

interface RequiredProjectAction {
  code: 'UIFN_PRESET_LOCKFILE_REFRESH_REQUIRED';
  path: string;
  command: string;
  message: string;
}

export interface PresetMutationResult {
  ok: boolean;
  dryRun: boolean;
  written: string[];
  unchanged: string[];
  rolledBack?: boolean;
  requiredActions?: RequiredProjectAction[];
  plan?: {
    code: string;
    url: string;
    files: Array<{ path: string; operation: FileOperation }>;
    artifacts?: string[];
    commands: PresetCompilePlan['commands'];
  };
  error?: { code: string; message: string; path?: string; conflicts?: unknown[] };
}

function flag(code: string, message: string, extras: Record<string, unknown> = {}): PresetMutationResult {
  return { ok: false, dryRun: false, written: [], unchanged: [], error: { code, message, ...extras } };
}

function resolveInput(options: PresetMutationOptions): UIFnPresetV1 {
  if (typeof options.preset === 'string') return decodePreset(options.preset);
  if (options.preset) return normalizePreset(options.preset);
  throw new UIFnPresetError('UIFN_PRESET_USAGE', 'A preset object or code is required.');
}

function serializeState(plan: PresetCompilePlan, files: Record<string, string>, previous: Record<string, string> = {}): string {
  const managed = Object.fromEntries(
    Object.entries(files)
      .filter(([relativePath]) => relativePath !== PRESET_STATE_PATH)
      .map(([relativePath, contents]) => [relativePath, checksumContent(contents)]),
  );
  const state: PresetProjectState = {
    schemaVersion: 1,
    code: plan.code,
    preset: plan.preset,
    template: plan.template,
    files: { ...previous, ...managed },
  };
  return `${JSON.stringify(state, null, 2)}\n`;
}

function themeCss(plan: PresetCompilePlan): string {
  return `${plan.css.fonts}\n${plan.css.light}\n${plan.css.dark}\n${fixtureCss()}\nhtml,body,#root{min-height:100%;margin:0;}\nbody{background:var(--uifn-color-surface-canvas);color:var(--uifn-color-text-primary);}\n`;
}

function appSource(plan: PresetCompilePlan): string {
  const imports = Object.entries(PRESET_FIXTURE_COMPONENTS).map(([name, module]) =>
    `import { ${name} } from '${plan.preset.installMode === 'source' ? '../components/uifn/react/' + module : '@uifn/components-react/' + module}';`).join('\n');
  return `import * as React from 'react';\nimport { renderPresetFixture, type ReactFixtureNode } from './uifn-fixture';\n${imports}\nimport '@uifn/components/styles.css';\nconst components: Record<string, React.ElementType> = { ${Object.keys(PRESET_FIXTURE_COMPONENTS).join(', ')} };\nconst tree: ReactFixtureNode = ${JSON.stringify(presetFixtureTree(plan))};\nexport function App() { return renderPresetFixture(tree, components, typeof document === 'undefined' ? undefined : document.getElementById('root')); }\n`;
}

function mainSource(): string {
  return `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { App } from './App';\nimport './uifn-theme.css';\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n`;
}

function indexHtml(): string {
  return `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>uifn app</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`;
}

function viteConfig(): string {
  return `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`;
}

function tsconfig(): string {
  return `{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "ESNext",\n    "moduleResolution": "Bundler",\n    "jsx": "react-jsx",\n    "strict": true,\n    "skipLibCheck": true\n  },\n  "include": ["src"]\n}\n`;
}

function mergePackageDependencies(
  source: string,
  dependencies: Array<{ name: string; resolvedVersion: string; operation: 'add' | 'present' }>,
): string {
  const parsed = JSON.parse(source) as { dependencies?: Record<string, string> };
  const next = { ...parsed.dependencies };
  for (const dependency of dependencies) {
    if (!next[dependency.name]) next[dependency.name] = dependency.resolvedVersion;
  }
  parsed.dependencies = Object.fromEntries(Object.entries(next).sort(([left], [right]) => left.localeCompare(right)));
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function packageJson(plan: PresetCompilePlan): string {
  const dependencies = Object.fromEntries(plan.project.packages.map((entry) => [entry.name, entry.version]));
  return `${JSON.stringify({
    name: 'uifn-app',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
    },
    dependencies,
    devDependencies: {
      '@vitejs/plugin-react': '4.3.4',
      '@types/react': '18.3.31',
      '@types/react-dom': '18.3.7',
      typescript: '5.6.3',
      vite: '5.4.21',
    },
  }, null, 2)}\n`;
}

function desiredFiles(plan: PresetCompilePlan, domains: Array<'full' | PartialPresetDomain>): Record<string, string> {
  const files: Record<string, string> = {};
  if (domains.includes('full') || domains.includes('theme') || domains.includes('font')) files[PRESET_THEME_PATH] = themeCss(plan);
  if (domains.includes('full')) {
    files['index.html'] = indexHtml();
    files['vite.config.ts'] = viteConfig();
    files['tsconfig.json'] = tsconfig();
    files['package.json'] = packageJson(plan);
    files[PRESET_APP_PATH] = appSource(plan);
    files['src/uifn-fixture.ts'] = PRESET_REACT_FIXTURE_SOURCE;
    files[PRESET_MAIN_PATH] = mainSource();
    files['README.md'] = '# uifn app\n\nThe active preset code and settings are stored in `.uifn/preset.json`. This state is updated after full and partial applies.\n\nTo inspect or apply a preset, use `uifn preset decode <code>` or `uifn apply --preset <code>`.\n';
  }
  files[PRESET_STATE_PATH] = serializeState(plan, files);
  return files;
}

function readManagedHashes(rootDir: string): Record<string, string> {
  const pathname = path.join(rootDir, PRESET_STATE_PATH);
  if (!existsSync(pathname)) return {};
  try {
    const parsed = JSON.parse(readFileSync(pathname, 'utf8')) as PresetProjectState;
    return parsed.files ?? {};
  } catch {
    return {};
  }
}

function planFileChanges(rootDir: string, files: Record<string, string>): { changes: TransactionChange[]; summary: Array<{ path: string; operation: FileOperation }>; error?: PresetMutationResult } {
  const changes: TransactionChange[] = [];
  const summary: Array<{ path: string; operation: FileOperation }> = [];
  const tracked = readManagedHashes(rootDir);
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = assertContainedPath(rootDir, relativePath);
    if (!existsSync(absolute)) {
      summary.push({ path: relativePath, operation: 'create' });
      changes.push({ path: relativePath, operation: 'create', contents });
      continue;
    }
    const previousSha256 = checksumContent(readFileSync(absolute));
    const nextSha256 = checksumContent(contents);
    if (previousSha256 === nextSha256) {
      summary.push({ path: relativePath, operation: 'unchanged' });
      continue;
    }
    const baseSha256 = tracked[relativePath];
    if (relativePath !== PRESET_STATE_PATH && (!baseSha256 || baseSha256 !== previousSha256)) {
      return {
        changes: [],
        summary: [],
        error: flag('UIFN_REGISTRY_DIRTY_CONFLICT', `Refusing to overwrite a locally modified file: ${relativePath}`, {
          path: relativePath,
          conflicts: [{ path: relativePath, baseSha256, localSha256: previousSha256, incomingSha256: nextSha256 }],
        }),
      };
    }
    summary.push({ path: relativePath, operation: 'update' });
    changes.push({ path: relativePath, operation: 'update', contents, expectedSha256: previousSha256 });
  }
  return { changes, summary };
}

export function readProjectPreset(rootDir: string): { ok: true; state: PresetProjectState } | { ok: false; error: { code: string; message: string } } {
  const pathname = path.join(rootDir, PRESET_STATE_PATH);
  if (!existsSync(pathname)) return presetFailure('UIFN_PRESET_PROJECT_MISSING', 'No .uifn/preset.json was found in this project.');
  try {
    const parsed = JSON.parse(readFileSync(pathname, 'utf8')) as PresetProjectState;
    if (parsed?.schemaVersion !== 1 || !parsed.preset ||
        !APPROVED_SUPPORT_MATRIX.templates.includes(parsed.template) ||
        !parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files) ||
        Object.values(parsed.files).some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) {
      throw new UIFnPresetError('UIFN_PRESET_INVALID_JSON', 'Invalid managed preset state.');
    }
    const preset = normalizePreset(parsed.preset);
    const code = encodePreset(preset);
    if (typeof parsed.code !== 'string' || parsed.code !== code) {
      throw new UIFnPresetError('UIFN_PRESET_INVALID_JSON', 'Managed preset code must match the canonical preset.');
    }
    return { ok: true, state: { schemaVersion: 1, code, preset, template: parsed.template ?? 'react-vite', files: parsed.files ?? {} } };
  } catch (cause) {
    if (cause instanceof UIFnPresetError) return presetFailure(cause.code, cause.message, cause.details);
    return presetFailure('UIFN_PRESET_INVALID_JSON', 'Project preset state could not be parsed.');
  }
}

export function resolveProjectPreset(rootDir: string) {
  const resolved = readProjectPreset(rootDir);
  if (!resolved.ok) return resolved;
  const plan = compilePreset(resolved.state.preset, resolved.state.template);
  return { ok: true as const, ...resolved.state, url: plan.url, commands: plan.commands, deviations: resolved.state.code === encodePreset(resolved.state.preset) ? [] : ['normalized-code'] };
}

// A root manifest alone does not prove that the resolved package records exist.
// Generated manifests use exact versions, so their direct records must match too.
type DependencySection = 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'peerDependencies';
type NpmPackageRecord = Partial<Record<DependencySection, Record<string, string>>> & { version?: string; link?: boolean; resolved?: string };
interface NpmLockfile { lockfileVersion?: number; packages?: Record<string, NpmPackageRecord> }

function lockRecordVersion(lock: NpmLockfile, record: NpmPackageRecord): string | undefined {
  if (!record.link) return record.version;
  const resolved = record.resolved;
  if (typeof resolved !== 'string' || !resolved || /[\\:\0]/.test(resolved)) return undefined;
  const targetKey = path.posix.normalize(resolved);
  if (path.posix.isAbsolute(targetKey) || targetKey === '..' || targetKey.startsWith('../')) return undefined;
  // npm records the workspace target separately. Never follow filesystem paths
  // or chains of links in untrusted lock metadata.
  const target = lock.packages?.[targetKey];
  return target?.link ? undefined : target?.version;
}

function lockedDependencyVersion(lock: NpmLockfile, packageKey: string, name: string): string | undefined {
  let directory = packageKey;
  while (true) {
    const record = lock.packages?.[path.posix.join(directory, 'node_modules', name)];
    if (record) return lockRecordVersion(lock, record);
    if (!directory) return undefined;
    const parent = path.posix.dirname(directory);
    directory = parent === '.' ? '' : parent;
  }
}

function lockMatchesManifest(lock: NpmLockfile | null, manifest: Record<string, unknown>, packageKey = ''): boolean {
  if (lock?.lockfileVersion !== 2 && lock?.lockfileVersion !== 3) return false;
  const locked = lock.packages?.[packageKey];
  if (!locked) return false;
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const) {
    const desired = (manifest[section] ?? {}) as Record<string, string>;
    const recorded = locked[section] ?? {};
    if (Object.keys(desired).length !== Object.keys(recorded).length) return false;
    for (const [name, version] of Object.entries(desired)) {
      if (recorded[name] !== version || lockedDependencyVersion(lock, packageKey, name) !== version) return false;
    }
  }
  return true;
}

// Read ancestor metadata only. Never add an ancestor lockfile to the write transaction.
function governingLockfile(rootDir: string): { pathname: string; packageKey: string } | undefined {
  let directory = rootDir;
  let localLock: { pathname: string; packageKey: string } | undefined;
  while (true) {
    const pathname = directory === rootDir ? assertContainedPath(rootDir, 'package-lock.json') : path.join(directory, 'package-lock.json');
    if (existsSync(pathname)) {
      if (directory === rootDir) localLock = { pathname, packageKey: '' };
      else if (hasWorkspaceMetadata(directory, rootDir)) {
        return { pathname, packageKey: path.relative(directory, rootDir).split(path.sep).join('/') };
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) return localLock;
    directory = parent;
  }
}

function hasWorkspaceMetadata(directory: string, rootDir: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const workspaces = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages;
    if (Array.isArray(workspaces)) {
      const relative = path.relative(directory, rootDir).split(path.sep).join('/');
      const patterns = workspaces.filter((value): value is string => typeof value === 'string');
      const matches = (pattern: string) => minimatch(relative, pattern.replace(/^\.\//, '').replace(/\/$/, ''));
      let included = false;
      for (const pattern of patterns) {
        const prefix = /^!*/.exec(pattern)![0].length;
        if (matches(pattern.slice(prefix))) included = prefix % 2 === 0;
      }
      return included;
    }
  } catch { /* A lock package record can still identify the workspace. */ }
  try {
    const lock = JSON.parse(readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
    return Boolean(lock?.packages?.[path.relative(directory, rootDir).split(path.sep).join('/')]);
  } catch { return false; }
}

// Lock resolution belongs to npm. Never guess integrity hashes or run install
// scripts inside the file transaction; expose the required follow-up explicitly.
function requiredLockfileActions(rootDir: string, packageSource?: string): RequiredProjectAction[] {
  if (!packageSource) return [];
  const location = governingLockfile(rootDir);
  if (!location) return [];
  const manifest = JSON.parse(packageSource) as Record<string, unknown>;
  try {
    const lock = JSON.parse(readFileSync(location.pathname, 'utf8'));
    if (lockMatchesManifest(lock, manifest, location.packageKey)) return [];
  } catch { /* An unreadable lock also requires npm to regenerate it. */ }
  return [{
    code: 'UIFN_PRESET_LOCKFILE_REFRESH_REQUIRED',
    path: path.relative(rootDir, location.pathname).split(path.sep).join('/'),
    command: 'npm install --package-lock-only --ignore-scripts --lockfile-version=3',
    message: 'After applying this plan, use npm 7 or newer to run npm install --package-lock-only --ignore-scripts --lockfile-version=3 in the directory containing the reported lockfile and review it before npm ci. Ancestor workspace locks are checked conservatively; npm determines workspace membership. UIFn supports lockfile versions 2 and 3; older, malformed, or mismatched direct dependency records require refresh. UIFn leaves the lockfile unchanged. This check does not replace npm validation of the complete dependency tree.',
  }];
}

function mergePartialPreset(previous: UIFnPresetV1, incoming: UIFnPresetV1, only: PartialPresetDomain[]): UIFnPresetV1 {
  const preset = { ...previous };
  if (only.includes('font')) { preset.font = incoming.font; preset.headingFont = incoming.headingFont; }
  if (only.includes('theme')) {
    for (const field of ['style', 'baseColor', 'theme', 'chartColor', 'radius', 'density', 'menuTreatment'] as const) {
      preset[field] = incoming[field] as never;
    }
  }
  return preset;
}

function prepareProjectRoot(rootDir: string, mode: 'init' | 'apply', dryRun: boolean, createdDirectories: string[], createRoot = true): PresetMutationResult | undefined {
  if (!createRoot && !existsSync(rootDir)) return flag('UIFN_PRESET_PROJECT_MISSING', 'Consumer project root does not exist and createRoot is false.');
  if (mode === 'init') {
    if (!existsSync(rootDir)) {
      if (!dryRun) {
        for (let directory = rootDir; !existsSync(directory); directory = path.dirname(directory)) createdDirectories.push(directory);
        mkdirSync(rootDir, { recursive: true });
      }
    } else if (readdirSync(rootDir).length > 0 && !existsSync(path.join(rootDir, PRESET_STATE_PATH))) {
      return flag('UIFN_PRESET_PROJECT_AMBIGUOUS', 'Refusing to initialize a non-empty directory that is not already a uifn preset project.');
    }
  } else if (!existsSync(rootDir)) {
    return flag('UIFN_PRESET_PROJECT_MISSING', 'Consumer project root does not exist.');
  }
}

function mutationFailure(cause: unknown, dryRun: boolean): PresetMutationResult {
  if (cause instanceof UIFnPresetError) return { ...flag(cause.code, cause.message, cause.details), dryRun };
  const code = cause instanceof Error && 'code' in cause && typeof cause.code === 'string' && cause.code.startsWith('UIFN_') ? cause.code : 'UIFN_REGISTRY_CLI_ERROR';
  return { ...flag(code, cause instanceof Error ? cause.message : String(cause)), dryRun };
}

function removeCreatedDirectories(directories: string[]): void {
  for (const directory of directories) {
    try { rmdirSync(directory); } catch { /* Preserve nonempty directories after incomplete rollback. */ }
  }
}

function resolveMutationContext(options: PresetMutationOptions, mode: 'init' | 'apply', only?: PartialPresetDomain[]) {
  let template = options.template ?? 'react-vite';
  let preset = resolveInput(options);
  const rootDir = path.resolve(options.rootDir);
  const hasState = existsSync(assertContainedPath(rootDir, PRESET_STATE_PATH));
  let previous: PresetProjectState | undefined;
  if (mode === 'apply' || hasState) {
    const resolved = readProjectPreset(rootDir);
    if (!resolved.ok) return { ok: false as const, result: { ...flag(resolved.error.code, resolved.error.message), dryRun: Boolean(options.dryRun) } };
    previous = resolved.state;
    template = options.template ?? previous.template;
  }
  if (mode === 'apply' && only && previous) preset = mergePartialPreset(previous.preset, preset, only);
  assertApprovedInit(preset, template);
  const plan = compilePreset(preset, template);
  return { ok: true as const, rootDir, plan, previous };
}

function planSourceFiles(rootDir: string, plan: PresetCompilePlan, files: Record<string, string>, previous: PresetProjectState | undefined, allowMissingRoot: boolean) {
  const installed = planInstall({ rootDir, artifacts: [...plan.project.artifacts], framework: plan.preset.framework, allowMissingRoot });
  if (!installed.ok) return { ok: false as const, error: installed.error };
  if (files['package.json']) {
    files['package.json'] = mergePackageDependencies(files['package.json'], installed.plan.dependencies);
    files[PRESET_STATE_PATH] = serializeState(plan, files, previous?.files);
  }
  return {
    ok: true as const,
    changes: installed.plan.changes.filter(change => change.path !== 'package.json'),
    files: installed.plan.files.filter(file => file.path !== 'package.json').map(file => ({ path: file.path, operation: file.operation })),
  };
}

function mutate(options: PresetMutationOptions, mode: 'init' | 'apply'): PresetMutationResult {
  const createdDirectories: string[] = [];
  let succeeded = false;
  const only = options.only?.length ? options.only : undefined;
  try {
    const context = resolveMutationContext(options, mode, only);
    if (!context.ok) return context.result;
    const { rootDir, plan, previous } = context;
    const rootError = prepareProjectRoot(rootDir, mode, Boolean(options.dryRun), createdDirectories, options.createRoot);
    if (rootError) return { ...rootError, dryRun: Boolean(options.dryRun) };

    const domains: Array<'full' | PartialPresetDomain> = mode === 'init' || !only ? ['full'] : only;
    const files = desiredFiles(plan, domains);
    files[PRESET_STATE_PATH] = serializeState(plan, files, previous?.files);

    let artifactChanges: TransactionChange[] = [];
    let artifactFiles: Array<{ path: string; operation: FileOperation }> = [];
    if ((mode === 'init' || !only) && plan.preset.installMode === 'source') {
      const installed = planSourceFiles(rootDir, plan, files, previous, mode === 'init' && Boolean(options.dryRun));
      if (!installed.ok) return { ok: false, dryRun: Boolean(options.dryRun), written: [], unchanged: [], error: installed.error };
      artifactChanges = installed.changes;
      artifactFiles = installed.files;
    }

    const planned = planFileChanges(rootDir, files);
    if (planned.error) return { ...planned.error, dryRun: Boolean(options.dryRun) };

    const requiredActions = requiredLockfileActions(rootDir, files['package.json']);
    const summary = [...planned.summary, ...artifactFiles.filter((file) => !planned.summary.some((entry) => entry.path === file.path))];
    const resultPlan = { code: plan.code, url: plan.url, files: summary, artifacts: plan.preset.installMode === 'source' ? plan.project.artifacts : [], commands: plan.commands };
    if (options.dryRun) {
      return { ok: true, dryRun: true, requiredActions, written: [], unchanged: summary.filter((file) => file.operation === 'unchanged').map((file) => file.path), plan: resultPlan };
    }

    const committed = commitTransaction({ rootDir, changes: [...planned.changes, ...artifactChanges] }, { faultAfterWrites: options.faultAfterWrites });
    if (!committed.ok) return { ok: false, dryRun: false, written: [], unchanged: [], rolledBack: committed.rolledBack, error: committed.error };
    succeeded = true;
    return {
      ok: true,
      dryRun: false,
      requiredActions,
      written: committed.committed,
      unchanged: summary.filter((file) => file.operation === 'unchanged').map((file) => file.path),
      plan: resultPlan,
    };
  } catch (cause) {
    return mutationFailure(cause, Boolean(options.dryRun));
  } finally {
    if (!succeeded) removeCreatedDirectories(createdDirectories);
  }
}

export function initProject(options: PresetMutationOptions): PresetMutationResult {
  return mutate(options, 'init');
}

export function applyPreset(options: PresetMutationOptions): PresetMutationResult {
  if (options.only?.some((domain) => !APPROVED_SUPPORT_MATRIX.partialDomains.includes(domain))) {
    return { ...flag('UIFN_PRESET_UNKNOWN_OPTION', `Unsupported partial apply domain: ${options.only.join(', ')}.`, {
      allowed: APPROVED_SUPPORT_MATRIX.partialDomains,
    }), dryRun: Boolean(options.dryRun) };
  }
  return mutate(options, 'apply');
}
