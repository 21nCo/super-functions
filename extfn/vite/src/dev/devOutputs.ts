import fs from 'node:fs/promises';
import path from 'node:path';

import type { BrowserTarget } from 'extfn';

export type ExtfnOutputMode = 'build' | 'dev';

export function getTargetOutputDirName(
  target: BrowserTarget,
  mode: ExtfnOutputMode
): string {
  return mode === 'dev' ? `${target}-dev` : target;
}

export function getTargetOutputDir(
  outDir: string,
  target: BrowserTarget,
  mode: ExtfnOutputMode
): string {
  return path.join(outDir, getTargetOutputDirName(target, mode));
}

export async function ensureTargetOutputDirectories(
  outDir: string,
  targets: readonly BrowserTarget[],
  mode: ExtfnOutputMode
): Promise<Record<BrowserTarget, string>> {
  const entries = await Promise.all(
    targets.map(async (target) => {
      const directory = getTargetOutputDir(outDir, target, mode);
      await fs.mkdir(directory, { recursive: true });
      return [target, directory] as const;
    })
  );

  return Object.fromEntries(entries) as Record<BrowserTarget, string>;
}

export async function writeTargetFile(
  outputDir: string,
  relativePath: string,
  contents: string | Uint8Array
): Promise<void> {
  const targetPath = path.join(outputDir, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, contents);
}
