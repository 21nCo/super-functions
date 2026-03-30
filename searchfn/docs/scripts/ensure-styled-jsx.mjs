import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const rootNodeModules = join(scriptsDir, '..', '..', '..', 'node_modules');
const searchfnNodeModules = join(scriptsDir, '..', '..', 'node_modules');

const source = join(rootNodeModules, 'styled-jsx');
const target = join(searchfnNodeModules, 'styled-jsx');

if (!existsSync(source)) {
  console.error("[ensure-styled-jsx] Missing source package at root node_modules/styled-jsx");
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
