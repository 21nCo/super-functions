import { loadConfigModule } from '@superfunctions/cli';
import { discoverBackgroundHandlersInDirectory } from '@superfunctions/extfn';

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
