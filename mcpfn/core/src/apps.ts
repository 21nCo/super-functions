import { McpFnValidationError } from "./errors.js";
import type { McpFnRegistry } from "./registry.js";
import type { McpFnResourceDefinition } from "./types.js";

export const MCP_APP_EXTENSION_ID = "io.modelcontextprotocol/ui";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

export interface McpAppCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

export interface McpAppPermissions {
  camera?: boolean;
  microphone?: boolean;
  geolocation?: boolean;
  clipboardWrite?: boolean;
}

export interface McpAppResourceMetadata {
  csp?: McpAppCsp;
  permissions?: McpAppPermissions;
  domain?: string;
  prefersBorder?: boolean;
}

export interface McpAppToolMetadata {
  resourceUri: string;
  visibility?: Array<"model" | "app">;
}

export interface McpAppResourceOptions<TContext = undefined>
  extends Omit<McpFnResourceDefinition<TContext>, "uri" | "mimeType" | "metadata" | "read"> {
  uri: `ui://${string}`;
  html: string | ((context: TContext) => string | Promise<string>);
  ui?: McpAppResourceMetadata;
  metadata?: Record<string, unknown>;
}

function assertUiUri(uri: string): void {
  if (!uri.startsWith("ui://")) {
    throw new McpFnValidationError(`MCP App resource URI must use ui://: ${uri}`);
  }
  try { new URL(uri); } catch {
    throw new McpFnValidationError(`Invalid MCP App resource URI: ${uri}`);
  }
}

function assertHtml(html: string): void {
  if (!html.trim() || !/(<!doctype\s+html|<html(?:\s|>))/i.test(html)) {
    throw new McpFnValidationError("MCP App resources must contain an HTML5 document");
  }
}

function assertCsp(csp: McpAppCsp | undefined): void {
  if (!csp) return;
  for (const [kind, domains] of Object.entries(csp)) {
    if (!Array.isArray(domains)) {
      throw new McpFnValidationError(`MCP App CSP ${kind} must be an array`);
    }
    for (const domain of domains) {
      let url: URL;
      try { url = new URL(domain); } catch {
        throw new McpFnValidationError(`Invalid MCP App CSP domain: ${domain}`);
      }
      if (url.protocol !== "https:" && url.protocol !== "wss:") {
        throw new McpFnValidationError(`MCP App CSP domains must use https or wss: ${domain}`);
      }
    }
  }
}

export function mcpAppToolMetadata(
  resourceUri: `ui://${string}`,
  visibility: Array<"model" | "app"> = ["model", "app"],
): { ui: McpAppToolMetadata } {
  assertUiUri(resourceUri);
  if (!visibility.length || visibility.some((value) => value !== "model" && value !== "app")) {
    throw new McpFnValidationError("MCP App visibility must contain model and/or app");
  }
  return { ui: { resourceUri, visibility: [...new Set(visibility)] } };
}

export function createMcpAppResource<TContext = undefined>(
  options: McpAppResourceOptions<TContext>,
): McpFnResourceDefinition<TContext> {
  assertUiUri(options.uri);
  assertCsp(options.ui?.csp);
  if (typeof options.html === "string") assertHtml(options.html);
  const ui = options.ui ?? {};
  return {
    uri: options.uri,
    name: options.name,
    ...(options.title ? { title: options.title } : {}),
    ...(options.description ? { description: options.description } : {}),
    mimeType: MCP_APP_MIME_TYPE,
    ...(options.annotations ? { annotations: options.annotations } : {}),
    ...(options.icons ? { icons: options.icons } : {}),
    ...(options.subscribe ? { subscribe: options.subscribe } : {}),
    ...(options.unsubscribe ? { unsubscribe: options.unsubscribe } : {}),
    metadata: { ...options.metadata, ui },
    read: async (_uri, context) => {
      const html = typeof options.html === "function" ? await options.html(context) : options.html;
      assertHtml(html);
      return {
        contents: [{
          uri: options.uri,
          mimeType: MCP_APP_MIME_TYPE,
          text: html,
          _meta: { ui },
        }],
      };
    },
  };
}

/** Validates tool-to-UI linkage across the complete registry. */
export function assertMcpAppContracts<TContext>(registry: McpFnRegistry<TContext>): void {
  const resources = new Map(registry.resourceDefinitions().map((resource) => [resource.uri, resource]));
  for (const resource of resources.values()) {
    if (!resource.uri.startsWith("ui://")) continue;
    if (resource.mimeType !== MCP_APP_MIME_TYPE) {
      throw new McpFnValidationError(
        `MCP App resource ${resource.uri} must use ${MCP_APP_MIME_TYPE}`,
      );
    }
    const ui = resource.metadata?.ui as McpAppResourceMetadata | undefined;
    assertCsp(ui?.csp);
  }
  for (const tool of registry.definitions()) {
    const ui = tool.metadata?.ui as McpAppToolMetadata | undefined;
    if (!ui) continue;
    assertUiUri(ui.resourceUri);
    const resource = resources.get(ui.resourceUri);
    if (!resource) {
      throw new McpFnValidationError(
        `Tool ${tool.name} links to missing MCP App resource ${ui.resourceUri}`,
      );
    }
    if (resource.mimeType !== MCP_APP_MIME_TYPE) {
      throw new McpFnValidationError(
        `Tool ${tool.name} links to a resource without the MCP App MIME type`,
      );
    }
    if (
      ui.visibility !== undefined &&
      (!Array.isArray(ui.visibility) ||
        !ui.visibility.length ||
        ui.visibility.some((value) => value !== "model" && value !== "app"))
    ) throw new McpFnValidationError(`Tool ${tool.name} has invalid MCP App visibility`);
  }
}
