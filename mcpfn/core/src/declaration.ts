import { createManifest, type CreateManifestOptions } from "./manifest.js";
import { McpFnRegistry } from "./registry.js";
import {
  createMcpFnServer,
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
  "info" | "registry" | keyof CreateManifestOptions
>;

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
    this.registry = options.registry ?? new McpFnRegistry<TContext>();
    for (const tool of options.tools ?? []) this.registry.register(tool);
    for (const resource of options.resources ?? []) this.registry.registerResource(resource);
    for (const template of options.resourceTemplates ?? []) {
      this.registry.registerResourceTemplate(template);
    }
    for (const prompt of options.prompts ?? []) this.registry.registerPrompt(prompt);
    this.manifestOptions = {
      protocolVersions: options.protocolVersions,
      transports: options.transports,
      extensions: options.extensions,
      capabilities: options.capabilities,
      clientRequirements: options.clientRequirements,
    };
  }

  manifest(): McpFnManifest {
    return createManifest(this.info, this.registry, this.manifestOptions);
  }

  createServer(
    runtime: McpFnServerRuntimeOptions<TContext> = {},
  ): McpFnServer<TContext> {
    return createMcpFnServer({
      ...this.manifestOptions,
      ...runtime,
      info: this.info,
      registry: this.registry,
    });
  }
}

export function defineMcpFnServer<TContext = undefined>(
  options: McpFnServerDeclarationOptions<TContext>,
): McpFnServerDeclaration<TContext> {
  return new McpFnServerDeclaration(options);
}
