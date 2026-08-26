#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build as buildWithTsup } from 'tsup';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(packageRoot, 'dist');

function primitiveMetadata() {
  const catalogPath = path.resolve(packageRoot, '..', 'catalog', 'generated', 'catalog.json');
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  return catalog.primitives.map((primitive) => {
    const interactive = primitive.implementationKind === 'interactive-controller';
    return {
      id: primitive.id,
      input: primitive.name === 'HoverCard'
        ? 'CreateHoverCardProps'
        : `${primitive.name}Props`,
      runtime: interactive
        ? `create${primitive.name}Controller`
        : `${primitive.name}Contract`,
      secondaryType: interactive
        ? `${primitive.name}Controller`
        : `${primitive.name}ContractParts`,
    };
  });
}

async function writePrimitiveEntries(primitives) {
  const entryDirectory = path.join(outputRoot, 'primitive-entries');
  mkdirSync(entryDirectory, { recursive: true });
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'uifn-core-primitive-entries-'));
  try {
    for (const primitive of primitives) {
      const temporaryEntry = path.join(temporaryRoot, `${primitive.id}.ts`);
      writeFileSync(
        temporaryEntry,
        `export { ${primitive.runtime} } from ${JSON.stringify(path.join(packageRoot, 'src/primitives/index.ts'))};\n`,
      );
      await buildWithTsup({
        entry: { [`primitive-entries/${primitive.id}`]: temporaryEntry },
        outDir: outputRoot,
        format: ['cjs', 'esm'],
        outExtension({ format }) {
          return { js: format === 'esm' ? '.mjs' : '.js' };
        },
        dts: false,
        clean: false,
        splitting: false,
        sourcemap: true,
        bundle: true,
        treeshake: true,
        minify: false,
        platform: 'neutral',
        target: 'es2020',
        define: { __UIFN_DEV_TRACE__: 'false' },
        silent: true,
      });
      writeFileSync(
        path.join(entryDirectory, `${primitive.id}.d.ts`),
        `export { ${primitive.runtime}, type ${primitive.input}, type ${primitive.secondaryType} } from '../primitives/index';\n`,
      );
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const localTsup = path.join(packageRoot, 'node_modules', '.bin', 'tsup');
const command = existsSync(localTsup) && statSync(localTsup).isFile() ? localTsup : 'tsup';
const bundled = spawnSync(
  command,
  ['--config', path.join(packageRoot, 'tsup.config.ts')],
  {
    cwd: packageRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  },
);
if (bundled.status !== 0) process.exit(bundled.status ?? 1);

const primitives = primitiveMetadata();
await writePrimitiveEntries(primitives);
const primitiveCount = primitives.length;
console.log(`Built ${primitiveCount} public primitive entrypoints without publishing private runtime modules.`);
