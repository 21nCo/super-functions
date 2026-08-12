import { discoverBackgroundHandlersInDirectory } from '@extfn/core';
import { loadConfigModule } from '../loadConfigModule.js';

export async function discoverBackgroundHandlers(
  directoryPath: string
) {
  return await discoverBackgroundHandlersInDirectory(
    directoryPath,
    async (modulePath) =>
      (
        await loadConfigModule(modulePath, {
          resolveFunctions: false,
        })
      ).module
  );
}
