import { discoverBackgroundPortHandlersInDirectory } from '@extfn/core';
import { loadConfigModule } from '../loadConfigModule.js';

export async function discoverBackgroundPorts(
  directoryPath: string
) {
  return await discoverBackgroundPortHandlersInDirectory(
    directoryPath,
    async (modulePath) =>
      (
        await loadConfigModule(modulePath, {
          resolveFunctions: false,
        })
      ).module
  );
}
