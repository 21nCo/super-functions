import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../cli';
import { encodePreset, normalizePreset } from '../preset';
import { applyPreset, initProject, readProjectPreset } from '../preset/project';

function snapshot(rootDir: string): string {
  const entries: string[] = [];
  const walk = (relative = '') => {
    if (!existsSync(path.join(rootDir, relative))) return;
    for (const name of readdirSync(path.join(rootDir, relative)).sort()) {
      const child = path.join(relative, name);
      const pathname = path.join(rootDir, child);
      try {
        entries.push(`${child}\0${createHash('sha256').update(readFileSync(pathname)).digest('hex')}`);
      } catch {
        walk(child);
      }
    }
  };
  walk();
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

async function withProject(callback: (rootDir: string) => Promise<void> | void) {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'uifn-preset-cli-'));
  try { await callback(rootDir); } finally { rmSync(rootDir, { recursive: true, force: true }); }
}

describe('preset CLI and project workflows', () => {
  const code = encodePreset({ style: 'atlas', baseColor: 'stone', density: 'compact' });

  it('encodes, decodes, and prints a share URL', async () => {
    const encoded = await runCli(['preset', 'encode', '--style', 'atlas', '--base-color', 'stone', '--density', 'compact', '--json'], { stdout: () => {}, stderr: () => {} });
    expect(encoded.exitCode).toBe(0);
    expect(encoded.result).toMatchObject({ ok: true, code, preset: normalizePreset({ style: 'atlas', baseColor: 'stone', density: 'compact' }) });
    const decoded = await runCli(['preset', 'decode', code, '--json'], { stdout: () => {}, stderr: () => {} });
    expect(decoded.result).toMatchObject({ ok: true, code, url: expect.stringContaining(code) });
  });

  it('initializes a react-vite project from a dry-run plan, then commits idempotently', async () => {
    await withProject(async (parent) => {
      const rootDir = path.join(parent, 'app');
      const dry = initProject({ rootDir, preset: code, dryRun: true });
      expect(dry.ok).toBe(true);
      expect(dry.dryRun).toBe(true);
      expect(existsSync(rootDir)).toBe(false);
      const first = initProject({ rootDir, preset: code });
      expect(first.ok).toBe(true);
      expect(existsSync(path.join(rootDir, '.uifn/preset.json'))).toBe(true);
      expect(readFileSync(path.join(rootDir, 'src/uifn-theme.css'), 'utf8')).toContain('--uifn-color-accent-solid:');
      const after = snapshot(rootDir);
      const second = applyPreset({ rootDir, preset: code });
      expect(second.ok).toBe(true);
      expect(second.written).toEqual([]);
      expect(snapshot(rootDir)).toBe(after);
    });
  });

  it('partially applies theme/font without installing source artifacts', async () => {
    await withProject(async (rootDir) => {
      expect(initProject({ rootDir, preset: encodePreset({ installMode: 'package' }) }).ok).toBe(true);
      expect(existsSync(path.join(rootDir, 'components'))).toBe(false);
      const next = encodePreset({ installMode: 'package', radius: 'xl', font: 'ibm-plex-sans' });
      const result = applyPreset({ rootDir, preset: next, only: ['theme', 'font'] });
      expect(result.ok).toBe(true);
      expect(readFileSync(path.join(rootDir, 'src/uifn-theme.css'), 'utf8')).toContain('IBM Plex Sans');
      expect(existsSync(path.join(rootDir, 'components'))).toBe(false);
    });
  });

  it('rejects dirty consumer edits and interrupted writes restore bytes', async () => {
    await withProject(async (rootDir) => {
      expect(initProject({ rootDir, preset: code }).ok).toBe(true);
      const theme = path.join(rootDir, 'src/uifn-theme.css');
      writeFileSync(theme, '/* consumer edit */\n');
      const before = snapshot(rootDir);
      const conflicted = applyPreset({ rootDir, preset: encodePreset({ style: 'nova' }) });
      expect(conflicted).toMatchObject({ ok: false, error: { code: 'UIFN_REGISTRY_DIRTY_CONFLICT' } });
      expect(snapshot(rootDir)).toBe(before);
    });
    await withProject(async (parent) => {
      const rootDir = path.join(parent, 'interrupted');
      const result = initProject({ rootDir, preset: code, faultAfterWrites: 1 });
      expect(result).toMatchObject({ ok: false, rolledBack: true, error: { code: 'UIFN_REGISTRY_TRANSACTION_INTERRUPTED' } });
      expect(existsSync(path.join(rootDir, 'src/uifn-theme.css'))).toBe(false);
    });
  });

  it('wires init/apply/resolve through the CLI', async () => {
    await withProject(async (rootDir) => {
      const init = await runCli(['init', '--preset', code, '--dry-run', '--json'], { cwd: rootDir, stdout: () => {}, stderr: () => {} });
      expect(init.result).toMatchObject({ ok: true, dryRun: true, plan: { code } });
      const committed = await runCli(['init', '--preset', code, '--json'], { cwd: rootDir, stdout: () => {}, stderr: () => {} });
      expect(committed.exitCode).toBe(0);
      const resolved = await runCli(['preset', 'resolve', '--json'], { cwd: rootDir, stdout: () => {}, stderr: () => {} });
      expect(resolved.result).toMatchObject({ ok: true, code, preset: normalizePreset({ style: 'atlas', baseColor: 'stone', density: 'compact' }) });
    });
  });

  it('rejects encoded svelte/solid values for V1 init/apply', async () => {
    await withProject(async (rootDir) => {
      const svelte = encodePreset({ framework: 'svelte' });
      const result = initProject({ rootDir, preset: svelte, dryRun: true });
      expect(result).toMatchObject({ ok: false, error: { code: 'UIFN_PRESET_UNSUPPORTED_COMBINATION' } });
      expect(existsSync(rootDir) && readdirSync(rootDir).length > 0).toBe(false);
    });
  });

  it('plans source-install artifacts without writing on dry-run', async () => {
    await withProject(async (parent) => {
      const rootDir = path.join(parent, 'source-app');
      const sourceCode = encodePreset({ installMode: 'source' });
      const dry = initProject({ rootDir, preset: sourceCode, dryRun: true });
      expect(dry.ok).toBe(true);
      expect(dry.plan?.artifacts).toEqual(expect.arrayContaining(['button', 'dialog', 'table']));
      expect(existsSync(rootDir)).toBe(false);
      const committed = initProject({ rootDir, preset: sourceCode });
      expect(committed.ok).toBe(true);
      expect(existsSync(path.join(rootDir, '.uifn/preset.json'))).toBe(true);
      expect(existsSync(path.join(rootDir, '.uifn/registry.lock'))).toBe(true);
      expect(existsSync(path.join(rootDir, 'components/uifn/react/button.ts'))).toBe(true);
      const manifest = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
      expect(manifest.devDependencies['@types/react']).toBeDefined();
      expect(manifest.devDependencies['@types/react-dom']).toBeDefined();
      expect(manifest.devDependencies.vite).toBeDefined();
      expect(manifest.dependencies['@uifn/react']).toBeDefined();
      expect(committed.plan?.artifacts).toEqual(expect.arrayContaining(['button']));
    });
  });
  it('rejects unmanaged collisions without changing any bytes', async () => {
    await withProject(rootDir => {
      writeFileSync(path.join(rootDir, 'package.json'), '{"name":"consumer"}');
      const before = snapshot(rootDir);
      expect(applyPreset({ rootDir, preset: code }).ok).toBe(false);
      expect(snapshot(rootDir)).toBe(before);
    });
  });

  it('retains untouched ownership and isolates theme from font changes', async () => {
    await withProject(rootDir => {
      expect(initProject({ rootDir, preset: code }).ok).toBe(true);
      const old = readProjectPreset(rootDir);
      if (!old.ok) throw new Error('Missing state');
      const incoming = encodePreset({ font: 'literata', radius: 'xl', baseColor: 'mauve', framework: 'solid' });
      expect(applyPreset({ rootDir, preset: incoming, only: ['font'] }).ok).toBe(true);
      const next = readProjectPreset(rootDir);
      if (!next.ok) throw new Error('Missing state');
      expect(next.state.preset).toEqual({ ...old.state.preset, font: 'literata', headingFont: 'inherit' });
      expect(next.state.files['src/App.tsx']).toBe(old.state.files['src/App.tsx']);
      writeFileSync(path.join(rootDir, 'src/App.tsx'), '// consumer edit');
      const before = snapshot(rootDir);
      expect(applyPreset({ rootDir, preset: code }).ok).toBe(false);
      expect(snapshot(rootDir)).toBe(before);
      expect(applyPreset({ rootDir, preset: incoming, only: ['theme'] }).ok).toBe(true);
      const final = readProjectPreset(rootDir);
      expect(final.ok && final.state.preset.font).toBe('literata');
      expect(final.ok && final.state.preset.framework).toBe('react');
    });
  });

  it('removes a newly created root after rollback', async () => {
    await withProject(parent => {
      const rootDir = path.join(parent, 'new', 'app');
      expect(initProject({ rootDir, preset: code, faultAfterWrites: 1 }).ok).toBe(false);
      expect(existsSync(rootDir)).toBe(false);
      expect(existsSync(path.join(parent, 'new'))).toBe(false);
    });
  });

  it.each([['apply', '--only'], ['init', '--dir']])('rejects missing flag values: %j', async (...args) => {
    await withProject(async rootDir => {
      const result = await runCli([args[0], '--preset', code, args[1]], { cwd: rootDir, stdout: () => {}, stderr: () => {} });
      expect(result.exitCode).not.toBe(0);
      expect(readdirSync(rootDir)).toEqual([]);
    });
  });

  it('plans all source files for a missing root without creating it', async () => {
    await withProject(parent => {
      const rootDir = path.join(parent, 'source-preview');
      const preset = encodePreset({ installMode: 'source' });
      const dry = initProject({ rootDir, preset, dryRun: true });
      expect(dry.ok).toBe(true);
      expect(existsSync(rootDir)).toBe(false);
      const committed = initProject({ rootDir, preset });
      expect(committed.ok).toBe(true);
      expect(dry.plan?.files).toEqual(committed.plan?.files);
    });
  });

});

it.each([undefined, "broken", encodePreset({ style: "atlas" })])('rejects inconsistent managed codes: %s', (code) => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), 'uifn-state-code-'));
  try {
    expect(initProject({ rootDir, preset: encodePreset({}) }).ok).toBe(true);
    const statePath = path.join(rootDir, '.uifn/preset.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.code = code;
    writeFileSync(statePath, JSON.stringify(state));
    expect(readProjectPreset(rootDir).ok).toBe(false);
  } finally { rmSync(rootDir, { recursive: true, force: true }); }
});

it('applies the same symlink containment checks during dry-run', async () => {
  await withProject(async parent => {
    const rootDir = path.join(parent, 'app');
    const outside = path.join(parent, 'outside.css');
    const code = encodePreset({ installMode: 'package' });
    expect(initProject({ rootDir, preset: code }).ok).toBe(true);
    const theme = path.join(rootDir, 'src/uifn-theme.css');
    writeFileSync(outside, readFileSync(theme));
    rmSync(theme); symlinkSync(outside, theme);
    for (const dryRun of [true, false]) {
      const result = applyPreset({ rootDir, preset: code, dryRun });
      expect(result).toMatchObject({ ok: false, error: { code: 'UIFN_REGISTRY_SYMLINK_ESCAPE' } });
    }
  });
});

it.each([true, false])('rejects symlinked project roots for init and apply (dryRun=%s)', async dryRun => {
  await withProject(async parent => {
    const rootDir = path.join(parent, 'app');
    const linked = path.join(parent, 'linked');
    const code = encodePreset({});
    expect(initProject({ rootDir, preset: code }).ok).toBe(true);
    const before = readFileSync(path.join(rootDir, '.uifn/preset.json'), 'utf8');
    symlinkSync(rootDir, linked, 'dir');
    for (const mutate of [initProject, applyPreset]) {
      expect(mutate({ rootDir: linked, preset: encodePreset({ style: 'atlas' }), dryRun }))
        .toMatchObject({ ok: false, dryRun, written: [], error: { code: 'UIFN_REGISTRY_SYMLINK_ESCAPE' } });
    }
    expect(readFileSync(path.join(rootDir, '.uifn/preset.json'), 'utf8')).toBe(before);
  });
});

it.each([true, false])('rejects dangling managed symlinks before planning or writing (dryRun=%s)', async dryRun => {
  await withProject(async parent => {
    const rootDir = path.join(parent, 'app');
    const outside = path.join(parent, 'absent.css');
    const code = encodePreset({});
    expect(initProject({ rootDir, preset: code }).ok).toBe(true);
    const theme = path.join(rootDir, 'src/uifn-theme.css');
    rmSync(theme); symlinkSync(outside, theme);
    expect(applyPreset({ rootDir, preset: code, dryRun })).toMatchObject({ ok: false, dryRun, error: { code: 'UIFN_REGISTRY_SYMLINK_ESCAPE' } });
    expect(existsSync(outside)).toBe(false);
  });
});

function npmLock(packageSource: string, lockfileVersion = 3): { lockfileVersion: number; packages: Record<string, { version?: string }> } {
  const manifest = JSON.parse(packageSource);
  return {
    lockfileVersion,
    packages: {
      '': manifest,
      ...Object.fromEntries(Object.entries({ ...manifest.dependencies, ...manifest.devDependencies }).map(([name, version]) => [`node_modules/${name}`, { version }])),
    },
  };
}

it.each(['iconLibrary', 'installMode'] as const)('reports required npm lock refresh when %s changes, including repeat applies', async axis => {
  await withProject(async parent => {
    const rootDir = path.join(parent, 'app');
    expect(initProject({ rootDir, preset: encodePreset({}) }).ok).toBe(true);
    const packagePath = path.join(rootDir, 'package.json');
    const lockPath = path.join(rootDir, 'package-lock.json');
    const originalPackage = readFileSync(packagePath, 'utf8');
    const originalLock = JSON.stringify(npmLock(originalPackage));
    writeFileSync(lockPath, originalLock);
    expect(applyPreset({ rootDir, preset: encodePreset({}), dryRun: true }).requiredActions).toEqual([]);
    const code = encodePreset(axis === 'iconLibrary' ? { iconLibrary: 'phosphor' } : { installMode: 'source' });
    const dry = applyPreset({ rootDir, preset: code, dryRun: true });
    expect(dry.ok).toBe(true);
    expect(dry.requiredActions).toMatchObject([{ code: 'UIFN_PRESET_LOCKFILE_REFRESH_REQUIRED', command: 'npm install --package-lock-only --ignore-scripts --lockfile-version=3' }]);
    expect(readFileSync(packagePath, 'utf8')).toBe(originalPackage);
    const applied = applyPreset({ rootDir, preset: code });
    expect(applied.ok).toBe(true);
    expect(applied.requiredActions).toEqual(dry.requiredActions);
    expect(readFileSync(lockPath, 'utf8')).toBe(originalLock);
    expect(applyPreset({ rootDir, preset: code }).requiredActions).toEqual(dry.requiredActions);
    writeFileSync(lockPath, JSON.stringify(npmLock(readFileSync(packagePath, 'utf8'))));
    expect(applyPreset({ rootDir, preset: code }).requiredActions).toEqual([]);
  });
});


it.each(['v1', 'missing', 'stale', 'invalid'] as const)('requires an actionable lock refresh for %s records', async scenario => {
  await withProject(async parent => {
    const rootDir = path.join(parent, 'app');
    const preset = encodePreset({});
    expect(initProject({ rootDir, preset }).ok).toBe(true);
    const packageSource = readFileSync(path.join(rootDir, 'package.json'), 'utf8');
    const lock = npmLock(packageSource);
    if (scenario === 'v1') { lock.lockfileVersion = 1; delete (lock as any).packages; }
    if (scenario === 'missing') delete lock.packages['node_modules/react'];
    if (scenario === 'stale') lock.packages['node_modules/react'].version = '17.0.2';
    const lockPath = path.join(rootDir, 'package-lock.json');
    writeFileSync(lockPath, scenario === 'invalid' ? '{' : JSON.stringify(lock));
    const dry = applyPreset({ rootDir, preset, dryRun: true });
    expect(dry.requiredActions?.[0].command).toContain('--lockfile-version=3');
    expect(dry.requiredActions?.[0].message).toContain('npm 7 or newer');
    expect(applyPreset({ rootDir, preset }).requiredActions).toEqual(dry.requiredActions);
    writeFileSync(lockPath, JSON.stringify(npmLock(packageSource)));
    expect(applyPreset({ rootDir, preset, dryRun: true }).requiredActions).toEqual([]);
  });
});

it('ships the canonical renderer locally in both install modes', async () => {
  const { PRESET_REACT_FIXTURE_SOURCE } = await import('../preset/fixture-source');
  expect(PRESET_REACT_FIXTURE_SOURCE).toBe(readFileSync(new URL('../../../react/src/fixture.ts', import.meta.url), 'utf8'));
  await withProject(async parent => {
    for (const installMode of ['package', 'source'] as const) {
      const rootDir = path.join(parent, installMode);
      expect(initProject({ rootDir, preset: encodePreset({ installMode }) }).ok).toBe(true);
      expect(readFileSync(path.join(rootDir, 'src/uifn-fixture.ts'), 'utf8')).toBe(PRESET_REACT_FIXTURE_SOURCE);
      const app = readFileSync(path.join(rootDir, 'src/App.tsx'), 'utf8');
      expect(app).toContain("from './uifn-fixture'");
      expect(app).not.toContain('@uifn/react/fixture');
    }
  });
});

it('honors createRoot false and preserves dry-run mode on errors', async () => {
  await withProject(async parent => {
    const rootDir = path.join(parent, 'absent');
    const preset = encodePreset({});
    for (const dryRun of [true, false]) {
      expect(initProject({ rootDir, preset, dryRun, createRoot: false })).toMatchObject({ ok: false, dryRun, error: { code: 'UIFN_PRESET_PROJECT_MISSING' } });
      expect(existsSync(rootDir)).toBe(false);
      expect(applyPreset({ rootDir, preset, dryRun, only: ['invalid' as never] })).toMatchObject({ ok: false, dryRun });
    }
    writeFileSync(path.join(parent, 'unmanaged.txt'), 'keep');
    expect(initProject({ rootDir: parent, preset, dryRun: true })).toMatchObject({ ok: false, dryRun: true });
    expect(initProject({ rootDir, preset: 'invalid', dryRun: true })).toMatchObject({ ok: false, dryRun: true });
  });
});

it.each(['preset', 'origin', 'code'])('rejects a missing --%s value', async flag => {
  const result = await runCli(['preset', 'url', `--${flag}`], { stdout: () => {}, stderr: () => {} });
  expect(result).toMatchObject({ exitCode: 1, result: { ok: false, error: { code: 'UIFN_PRESET_USAGE' } } });
});
