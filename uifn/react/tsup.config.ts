import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Options } from 'tsup';

const sourceRoot = path.resolve('src');

const preserveClientBoundaries: NonNullable<Options['esbuildPlugins']>[number] = {
  name: 'uifn-preserve-client-boundaries',
  setup(build) {
    build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
      const absolute = path.resolve(args.path);
      if (!absolute.startsWith(`${sourceRoot}${path.sep}`) && absolute !== sourceRoot) return undefined;
      const source = readFileSync(absolute, 'utf8');
      const directive = /^(?:'use client'|"use client");\s*/.exec(source);
      if (!directive) return undefined;
      const extension = path.extname(absolute);
      return {
        contents: source.slice(directive[0].length),
        loader: extension === '.tsx' || extension === '.jsx' ? 'tsx' : 'ts',
        resolveDir: path.dirname(absolute),
      };
    });
  },
};

function markClientEntry(outputPath: string): void {
  const absolute = path.resolve(outputPath);
  const contents = readFileSync(absolute, 'utf8');
  if (!contents.startsWith("'use client';")) writeFileSync(absolute, `'use client';\n${contents}`);
  const mapPath = `${absolute}.map`;
  if (!existsSync(mapPath)) return;
  const sourceMap = JSON.parse(readFileSync(mapPath, 'utf8')) as { mappings: string };
  if (sourceMap.mappings.startsWith(';')) return;
  sourceMap.mappings = `;${sourceMap.mappings}`;
  writeFileSync(mapPath, `${JSON.stringify(sourceMap)}\n`);
}

function dedupeSourceMapComments(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      dedupeSourceMapComments(target);
      continue;
    }
    if (!/\.(?:m?js)$/.test(entry.name)) continue;
    const source = readFileSync(target, 'utf8');
    let seenSourceMap = false;
    const lines = source.split('\n').filter((line) => {
      if (!line.startsWith('//# sourceMappingURL=')) return true;
      if (seenSourceMap) return false;
      seenSourceMap = true;
      return true;
    });
    const deduped = lines.join('\n');
    if (deduped !== source) writeFileSync(target, deduped);
  }
}

function markPublishedClientEntries(): void {
  dedupeSourceMapComments('dist');
  for (const extension of ['js', 'mjs']) markClientEntry(`dist/index.${extension}`);
  for (const source of readdirSync('src/generated').filter((file) => file.endsWith('.tsx'))) {
    const name = source.slice(0, -4);
    for (const extension of ['js', 'mjs']) markClientEntry(`dist/generated/${name}.${extension}`);
  }
  for (const source of readdirSync('src/hooks').filter((file) => file.endsWith('.ts') && file !== 'index.ts')) {
    const name = source.slice(0, -3);
    for (const extension of ['js', 'mjs']) markClientEntry(`dist/hooks/${name}.${extension}`);
  }
}

export default defineConfig({
  entry: ['src/index.ts', 'src/generated/*.tsx', 'src/hooks/*.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', '@uifn/core', '@uifn/adapter-kit', '@uifn/dom'],
  esbuildPlugins: [preserveClientBoundaries],
  onSuccess: markPublishedClientEntries,
  treeshake: true,
  minify: false,
});
