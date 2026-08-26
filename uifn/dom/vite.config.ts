import path from 'node:path';
import { defineConfig } from 'vite';

const reactFixtureRoot = path.resolve('../react/node_modules');

export default defineConfig({
  resolve: {
    alias: {
      react: path.join(reactFixtureRoot, 'react'),
      'react-dom': path.join(reactFixtureRoot, 'react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
});
