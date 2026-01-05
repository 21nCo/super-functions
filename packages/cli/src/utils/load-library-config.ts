import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Load library config file
 * Handles TS/JS/MJS with proper runtime compilation
 */
export async function loadLibraryConfig(
  configPath: string
): Promise<any> {
  const ext = path.extname(configPath);
  
  if (ext === '.ts') {
    // Use jiti for TypeScript (like better-auth does)
    const jiti = await import('jiti').then(m => m.default || m);
    const loader = jiti(process.cwd(), {
      interopDefault: true,
      extensions: ['.ts', '.js', '.mjs'],
    });
    
    const loaded = loader(configPath);
    
    // jiti with interopDefault wraps named exports in a default object
    // So for "export const config = {...}", loaded.default = { config: {...} }
    // and loaded.config = {...}
    // Prefer loaded.config over loaded.default to avoid getting wrapped object
    if (loaded.config !== undefined) {
      return loaded.config;
    }
    if (loaded.default !== undefined) {
      return loaded.default;
    }
    return loaded;
  }
  
  // JS/MJS - use dynamic import
  const fileUrl = pathToFileURL(configPath).href;
  const loaded = await import(fileUrl);
  return loaded.default || loaded.config || loaded;
}
