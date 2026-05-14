import { loadConfigModule } from '@superfunctions/cli';
import { discoverBackgroundPortHandlersInDirectory } from '@extfn/core';

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
