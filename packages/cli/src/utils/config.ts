import fs from 'node:fs';
import path from 'node:path';

import type { SuperfunctionsConfig } from '../index.js';

export async function loadConfig(configPath: string): Promise<SuperfunctionsConfig | null> {
  const resolved = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(resolved)) return null;

  const ext = path.extname(resolved);
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    const mod = await import(pathToFileUrl(resolved));
    return (mod.default ?? mod)?.adapter ? (mod.default ?? mod) as SuperfunctionsConfig : (mod.default ?? mod).config ?? (mod.default ?? mod);
  }
  if (ext === '.json') {
    const raw = fs.readFileSync(resolved, 'utf8');
    return JSON.parse(raw) as SuperfunctionsConfig;
  }
  if (ext === '.ts') {
    // We don't ship a TS runtime loader to keep deps slim. Suggest using JS for now.
    throw new Error('TypeScript config is not supported at runtime. Use superfunctions.config.js or JSON, or precompile your TS config.');
  }
  throw new Error(`Unsupported config extension: ${ext}`);
}

export function ensureConfigPath(p?: string) {
  return p ?? 'superfunctions.config.js';
}

function pathToFileUrl(p: string) {
  const u = new URL('file://');
  // On Windows path.resolve returns backslashes; URL needs forward slashes
  u.pathname = p.split(path.sep).join(path.posix.sep);
  return u.href;
}