import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibraryConfig } from '../utils/load-library-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('loadLibraryConfig', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = path.join(__dirname, `test-temp-load-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('TypeScript config files (.ts)', () => {
    it('should load TypeScript config with default export', async () => {
      const configPath = path.join(testDir, 'conduct.config.ts');
      fs.writeFileSync(
        configPath,
        `
        export default {
          namespace: 'conduct',
          models: {},
        };
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(config).toBeDefined();
      expect(config.namespace).toBe('conduct');
      expect(config.models).toEqual({});
    });

    it('should load TypeScript config with named config export', async () => {
      const configPath = path.join(testDir, 'authfn.config.ts');
      fs.writeFileSync(
        configPath,
        `
        export const config = {
          namespace: 'auth',
          plugins: [],
        };
        `
      );

      const loaded = await loadLibraryConfig(configPath);

      expect(loaded).toBeDefined();
      expect(loaded.namespace).toBe('auth');
      expect(loaded.plugins).toEqual([]);
    });

    it('should load TypeScript config with type annotations', async () => {
      const configPath = path.join(testDir, 'conduct.config.ts');
      fs.writeFileSync(
        configPath,
        `
        interface ConductConfig {
          namespace: string;
          models: Record<string, any>;
        }

        export const config: ConductConfig = {
          namespace: 'conduct',
          models: {
            project: { modelName: 'projects' },
          },
        };
        `
      );

      const loaded = await loadLibraryConfig(configPath);

      expect(loaded).toBeDefined();
      expect(loaded.namespace).toBe('conduct');
      expect(loaded.models.project.modelName).toBe('projects');
    });

    it('should load TypeScript config with imports', async () => {
      const configPath = path.join(testDir, 'conduct.config.ts');
      fs.writeFileSync(
        configPath,
        `
        // This would normally import from an actual package
        // For testing, we just use a constant
        const NAMESPACE = 'conduct';

        export default {
          namespace: NAMESPACE,
          models: {},
        };
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(config).toBeDefined();
      expect(config.namespace).toBe('conduct');
    });

    it('should handle complex TypeScript config objects', async () => {
      const configPath = path.join(testDir, 'conduct.config.ts');
      fs.writeFileSync(
        configPath,
        `
        export const config = {
          namespace: 'conduct',
          models: {
            project: {
              modelName: 'projects',
              customFields: {
                owner: { type: 'string' },
                status: { type: 'enum', values: ['active', 'archived'] },
              },
            },
            task: {
              modelName: 'tasks',
            },
          },
          additionalFields: {
            project: {
              metadata: { type: 'json' },
            },
          },
          plugins: [
            { name: 'audit', enabled: true },
          ],
        };
        `
      );

      const loaded = await loadLibraryConfig(configPath);

      expect(loaded).toBeDefined();
      expect(loaded.namespace).toBe('conduct');
      expect(loaded.models.project.modelName).toBe('projects');
      expect(loaded.models.project.customFields.owner.type).toBe('string');
      expect(loaded.models.task.modelName).toBe('tasks');
      expect(loaded.additionalFields.project.metadata.type).toBe('json');
      expect(loaded.plugins).toHaveLength(1);
      expect(loaded.plugins[0].name).toBe('audit');
    });
  });

  describe('JavaScript config files (.js)', () => {
    it('should load JavaScript config with default export', async () => {
      const configPath = path.join(testDir, 'conduct.config.js');
      fs.writeFileSync(
        configPath,
        `
        export default {
          namespace: 'conduct',
          models: {},
        };
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(config).toBeDefined();
      expect(config.namespace).toBe('conduct');
    });

    it('should load JavaScript config with named config export', async () => {
      const configPath = path.join(testDir, 'authfn.config.js');
      fs.writeFileSync(
        configPath,
        `
        export const config = {
          namespace: 'auth',
          plugins: [],
        };
        `
      );

      const loaded = await loadLibraryConfig(configPath);

      expect(loaded).toBeDefined();
      expect(loaded.namespace).toBe('auth');
    });

    it('should handle JavaScript config with computed properties', async () => {
      const configPath = path.join(testDir, 'conduct.config.js');
      fs.writeFileSync(
        configPath,
        `
        const prefix = 'conduct';
        
        export default {
          namespace: prefix,
          models: {
            [\`\${prefix}_project\`]: { modelName: 'projects' },
          },
        };
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(config).toBeDefined();
      expect(config.namespace).toBe('conduct');
      expect(config.models.conduct_project.modelName).toBe('projects');
    });
  });

  describe('ES Module config files (.mjs)', () => {
    it('should load .mjs config with default export', async () => {
      const configPath = path.join(testDir, 'conduct.config.mjs');
      fs.writeFileSync(
        configPath,
        `
        export default {
          namespace: 'conduct',
          models: {},
        };
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(config).toBeDefined();
      expect(config.namespace).toBe('conduct');
    });

    it('should load .mjs config with named config export', async () => {
      const configPath = path.join(testDir, 'authfn.config.mjs');
      fs.writeFileSync(
        configPath,
        `
        export const config = {
          namespace: 'auth',
          plugins: [],
        };
        `
      );

      const loaded = await loadLibraryConfig(configPath);

      expect(loaded).toBeDefined();
      expect(loaded.namespace).toBe('auth');
    });
  });

  describe('Export resolution priority', () => {
    it('should prefer default export over config export', async () => {
      const configPath = path.join(testDir, 'test.config.js');
      fs.writeFileSync(
        configPath,
        `
        export const config = {
          namespace: 'wrong',
        };
        
        export default {
          namespace: 'correct',
        };
        `
      );

      const loaded = await loadLibraryConfig(configPath);

      expect(loaded.namespace).toBe('correct');
    });

    it('should use config export when no default export', async () => {
      const configPath = path.join(testDir, 'test.config.js');
      fs.writeFileSync(
        configPath,
        `
        export const config = {
          namespace: 'correct',
        };
        `
      );

      const loaded = await loadLibraryConfig(configPath);

      expect(loaded.namespace).toBe('correct');
    });

    it('should fallback to entire module if neither default nor config exists', async () => {
      const configPath = path.join(testDir, 'test.config.js');
      fs.writeFileSync(
        configPath,
        `
        export const namespace = 'conduct';
        export const models = {};
        `
      );

      const loaded = await loadLibraryConfig(configPath);

      expect(loaded).toBeDefined();
      expect(loaded.namespace).toBe('conduct');
      expect(loaded.models).toEqual({});
    });
  });

  describe('Error handling', () => {
    it('should throw error for non-existent file', async () => {
      const configPath = path.join(testDir, 'nonexistent.config.ts');

      await expect(loadLibraryConfig(configPath)).rejects.toThrow();
    });

    it('should throw error for invalid JavaScript syntax', async () => {
      const configPath = path.join(testDir, 'invalid.config.js');
      fs.writeFileSync(
        configPath,
        `
        export default {
          namespace: 'conduct',
          invalid syntax here
        };
        `
      );

      await expect(loadLibraryConfig(configPath)).rejects.toThrow();
    });

    it('should throw error for invalid TypeScript syntax', async () => {
      const configPath = path.join(testDir, 'invalid.config.ts');
      fs.writeFileSync(
        configPath,
        `
        export default {
          namespace: 'conduct'
          missing comma
        };
        `
      );

      await expect(loadLibraryConfig(configPath)).rejects.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should load empty config object', async () => {
      const configPath = path.join(testDir, 'empty.config.js');
      fs.writeFileSync(
        configPath,
        `
        export default {};
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(config).toEqual({});
    });

    it('should load config with null values', async () => {
      const configPath = path.join(testDir, 'null.config.js');
      fs.writeFileSync(
        configPath,
        `
        export default {
          namespace: 'conduct',
          models: null,
          plugins: null,
        };
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(config.namespace).toBe('conduct');
      expect(config.models).toBeNull();
      expect(config.plugins).toBeNull();
    });

    it('should load config with undefined values', async () => {
      const configPath = path.join(testDir, 'undefined.config.js');
      fs.writeFileSync(
        configPath,
        `
        export default {
          namespace: 'conduct',
          models: undefined,
        };
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(config.namespace).toBe('conduct');
      expect(config.models).toBeUndefined();
    });

    it('should load config with array values', async () => {
      const configPath = path.join(testDir, 'array.config.js');
      fs.writeFileSync(
        configPath,
        `
        export default {
          namespace: 'conduct',
          plugins: ['plugin1', 'plugin2'],
          allowedModels: ['project', 'task'],
        };
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(config.plugins).toEqual(['plugin1', 'plugin2']);
      expect(config.allowedModels).toEqual(['project', 'task']);
    });

    it('should load config with nested objects', async () => {
      const configPath = path.join(testDir, 'nested.config.js');
      fs.writeFileSync(
        configPath,
        `
        export default {
          namespace: 'conduct',
          models: {
            project: {
              fields: {
                owner: {
                  type: 'relation',
                  target: {
                    model: 'user',
                    field: 'id',
                  },
                },
              },
            },
          },
        };
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(config.models.project.fields.owner.target.model).toBe('user');
    });

    it('should preserve function references in config', async () => {
      const configPath = path.join(testDir, 'function.config.js');
      fs.writeFileSync(
        configPath,
        `
        const customValidator = (value) => value.length > 0;
        
        export default {
          namespace: 'conduct',
          validators: {
            custom: customValidator,
          },
        };
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(typeof config.validators.custom).toBe('function');
      expect(config.validators.custom('test')).toBe(true);
      expect(config.validators.custom('')).toBe(false);
    });
  });

  describe('Real-world config patterns', () => {
    it('should load conduct-style config', async () => {
      const configPath = path.join(testDir, 'conduct.config.ts');
      fs.writeFileSync(
        configPath,
        `
        export const config = {
          namespace: 'conduct',
          models: {
            project: {
              modelName: 'projects',
            },
            task: {
              modelName: 'tasks',
            },
          },
          additionalFields: {
            project: {
              customField: { type: 'string' },
            },
          },
        };
        
        export default config;
        `
      );

      const loaded = await loadLibraryConfig(configPath);

      expect(loaded.namespace).toBe('conduct');
      expect(loaded.models.project.modelName).toBe('projects');
      expect(loaded.additionalFields.project.customField.type).toBe('string');
    });

    it('should load authfn-style config with plugins', async () => {
      const configPath = path.join(testDir, 'authfn.config.ts');
      fs.writeFileSync(
        configPath,
        `
        const oauthPlugin = {
          name: 'oauth',
          providers: ['google', 'github'],
        };
        
        export default {
          namespace: 'auth',
          plugins: [oauthPlugin],
          session: {
            expiresIn: 3600,
          },
        };
        `
      );

      const config = await loadLibraryConfig(configPath);

      expect(config.namespace).toBe('auth');
      expect(config.plugins).toHaveLength(1);
      expect(config.plugins[0].name).toBe('oauth');
      expect(config.session.expiresIn).toBe(3600);
    });
  });
});
