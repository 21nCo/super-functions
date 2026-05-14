import { loadConfigModule } from '@superfunctions/cli';
import { discoverBackgroundPortHandlersInDirectory } from 'extfn';

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
