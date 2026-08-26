import { createManifest, type CreateManifestOptions } from "./manifest.js";
import { McpFnRegistry } from "./registry.js";
import {
  createMcpFnServer,
  resolveMcpFnServerCapabilities,
  type McpFnServer,
  type McpFnServerOptions,
} from "./server.js";
import type {
  McpFnManifest,
  McpFnPromptDefinition,
  McpFnResourceDefinition,
  McpFnResourceTemplateDefinition,
  McpFnServerInfo,
  McpFnToolDefinition,
} from "./types.js";

export interface McpFnServerDeclarationOptions<TContext = undefined>
  extends CreateManifestOptions {
  info: McpFnServerInfo;
  tools?: McpFnToolDefinition<TContext>[];
  resources?: McpFnResourceDefinition<TContext>[];
  resourceTemplates?: McpFnResourceTemplateDefinition<TContext>[];
  prompts?: McpFnPromptDefinition<TContext>[];
  /** Reuse an existing registry while adopting the declaration/runtime split. */
  registry?: McpFnRegistry<TContext>;
}

export type McpFnServerRuntimeOptions<TContext> = Omit<
  McpFnServerOptions<TContext>,
  "info" | "registry" | "additionalCapabilities" | keyof CreateManifestOptions
>;

function hasDefinitionAdditions<TContext>(
  options: McpFnServerDeclarationOptions<TContext>,
): boolean {
  return Boolean(
    options.tools?.length ||
    options.resources?.length ||
    options.resourceTemplates?.length ||
    options.prompts?.length
  );
}

function cloneRegistry<TContext>(source: McpFnRegistry<TContext>): McpFnRegistry<TContext> {
  const clone = new McpFnRegistry<TContext>();
  for (const tool of source.definitions()) clone.register(tool);
  for (const resource of source.resourceDefinitions()) clone.registerResource(resource);
  for (const template of source.resourceTemplateDefinitions()) {
    clone.registerResourceTemplate(template);
  }
  for (const prompt of source.promptDefinitions()) clone.registerPrompt(prompt);
  return clone;
}

/**
 * Side-effect-free application declaration. The same registry and manifest
 * feed production transports, deterministic tests, and release tooling.
 */
export class McpFnServerDeclaration<TContext = undefined> {
  readonly info: McpFnServerInfo;
  readonly registry: McpFnRegistry<TContext>;
  private readonly manifestOptions: CreateManifestOptions;

  constructor(options: McpFnServerDeclarationOptions<TContext>) {
    this.info = options.info;
    this.registry = options.registry && hasDefinitionAdditions(options)
      ? cloneRegistry(options.registry)
      : options.registry ?? new McpFnRegistry<TContext>();
    for (const tool of options.tools ?? []) this.registry.register(tool);
    for (const resource of options.resources ?? []) this.registry.registerResource(resource);
    for (const template of options.resourceTemplates ?? []) {
      this.registry.registerResourceTemplate(template);
    }
    for (const prompt of options.prompts ?? []) this.registry.registerPrompt(prompt);
    const capabilities = resolveMcpFnServerCapabilities(
      this.registry,
      options.capabilities,
      Boolean(this.registry.capabilities().tasks),
    );
    this.manifestOptions = {
      protocolVersions: options.protocolVersions,
      transports: options.transports,
      extensions: options.extensions,
      capabilities,
      clientRequirements: options.clientRequirements,
    };
  }

  manifest(): McpFnManifest {
    return createManifest(this.info, this.registry, this.manifestOptions);
  }

  createServer(
    runtime: McpFnServerRuntimeOptions<TContext> = {},
  ): McpFnServer<TContext> {
    if (Object.hasOwn(runtime, "additionalCapabilities") || Object.hasOwn(runtime, "capabilities")) {
      throw new Error(
        "McpFn declaration capabilities must be configured on defineMcpFnServer(), not createServer()",
      );
    }
    return createMcpFnServer({
      ...runtime,
      ...this.manifestOptions,
      info: this.info,
      registry: this.registry,
      additionalCapabilities: this.manifestOptions.capabilities,
    });
  }
}

export function defineMcpFnServer<TContext = undefined>(
  options: McpFnServerDeclarationOptions<TContext>,
): McpFnServerDeclaration<TContext> {
  return new McpFnServerDeclaration(options);
}
