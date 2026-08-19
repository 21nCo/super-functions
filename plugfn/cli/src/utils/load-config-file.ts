import { loadConfig } from '@clifn/core';

export async function loadConfigFile(configPath: string): Promise<unknown> {
  const loaded = await loadConfig<unknown>({
    configPath,
    exportNames: ['plug'],
  });
  return loaded.config;
}
