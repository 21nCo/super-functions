import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/owned-artifacts.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
