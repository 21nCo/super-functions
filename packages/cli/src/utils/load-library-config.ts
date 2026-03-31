import path from 'node:path';

import { loadConfigModule } from './load-config-module.js';

/**
 * Load library config file
 * Handles TS/JS/MJS with proper runtime compilation
 */
export async function loadLibraryConfig(
  configPath: string
): Promise<any> {
  const extension = path.extname(configPath).toLowerCase();
  const loaded = await loadConfigModule(configPath, {
    exportNames: ['config'],
    exportPriority: extension === '.ts' ? 'named-first' : 'default-first',
    resolveFunctions: false,
  });

  return loaded.value;
}
