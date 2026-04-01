import fs from 'node:fs/promises';
import path from 'node:path';

import { zipSync, type Zippable } from 'fflate';

export interface ArchiveOptions {
  sourceDir: string;
  destinationFile: string;
}

export async function createDeterministicArchive(
  options: ArchiveOptions
): Promise<void> {
  const entries = await collectArchiveEntries(options.sourceDir);
  const archive = zipSync(entries, {
    level: 9,
  });

  await fs.mkdir(path.dirname(options.destinationFile), {
    recursive: true,
  });
  await fs.writeFile(options.destinationFile, archive);
}

async function collectArchiveEntries(sourceDir: string): Promise<Zippable> {
  const entries: Zippable = {};
  const files = await listFiles(sourceDir, sourceDir);

  for (const file of files) {
    entries[file.relativePath] = [
      new Uint8Array(await fs.readFile(file.absolutePath)),
      {
        mtime: new Date('1980-01-01T00:00:00.000Z'),
        os: 3,
        attrs: 0o100644 << 16,
      },
    ];
  }

  return entries;
}

async function listFiles(
  rootDir: string,
  currentDir: string
): Promise<Array<{ absolutePath: string; relativePath: string }>> {
  const directoryEntries = await fs.readdir(currentDir, {
    withFileTypes: true,
  });
  const files: Array<{ absolutePath: string; relativePath: string }> = [];

  for (const entry of directoryEntries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(rootDir, absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    files.push({
      absolutePath,
      relativePath: path.relative(rootDir, absolutePath).replace(/\\/g, '/'),
    });
  }

  return files;
}
