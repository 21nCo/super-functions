import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import type {
  McpFnTarget,
  McpFnTargetContext,
  McpFnTargetDescriptor,
  McpFnTransportHandle,
} from "./types.js";

export interface McpFnStdioTargetOptions extends Omit<StdioServerParameters, "command"> {
  command: string;
}

export interface McpFnStreamableHttpTargetOptions
  extends Omit<StreamableHTTPClientTransportOptions, "authProvider"> {
  authProvider?: OAuthClientProvider;
}

interface StateValidatingOAuthProvider extends OAuthClientProvider {
  validateAuthorizationState?(state: string | undefined): void | Promise<void>;
}

export function customTarget(options: {
  kind: string;
  descriptor?: Record<string, unknown>;
  open(context: McpFnTargetContext): Promise<McpFnTransportHandle> | McpFnTransportHandle;
}): McpFnTarget {
  const descriptor = Object.freeze({ kind: options.kind, ...options.descriptor });
  return {
    kind: options.kind,
    describe: () => ({ ...descriptor }),
    open: (context) => Promise.resolve(options.open(context)),
  };
}

export function transportTarget(
  transport: Transport,
  descriptor: McpFnTargetDescriptor = { kind: "custom" },
): McpFnTarget {
  let opened = false;
  return customTarget({
    kind: descriptor.kind,
    descriptor,
    open: () => {
      if (opened) throw new Error("A one-shot McpFn transport target cannot be reopened");
      opened = true;
      return { transport };
    },
  });
}

export function stdioTarget(options: McpFnStdioTargetOptions): McpFnTarget {
  if (!options.command.trim()) throw new Error("McpFn stdio target command is required");
  return customTarget({
    kind: "stdio",
    descriptor: {
      command: options.command,
      ...(options.cwd ? { cwd: options.cwd } : {}),
    },
    open: () => {
      const transport = new StdioClientTransport(options);
      return {
        transport,
        close: () => transport.close(),
      };
    },
  });
}

export function streamableHttpTarget(
  url: string | URL,
  options: McpFnStreamableHttpTargetOptions = {},
): McpFnTarget {
  const targetUrl = new URL(url.toString());
  const descriptorUrl = new URL(targetUrl.toString());
  descriptorUrl.search = "";
  descriptorUrl.hash = "";
  return customTarget({
    kind: "streamable-http",
    descriptor: { url: descriptorUrl.toString() },
    open: () => {
      const transport = new StreamableHTTPClientTransport(targetUrl, options);
      return {
        transport,
        finishAuthorization: async (authorizationCode, state) => {
          await (options.authProvider as StateValidatingOAuthProvider | undefined)
            ?.validateAuthorizationState?.(state);
          await transport.finishAuth(authorizationCode);
        },
        terminateSession: () => transport.terminateSession(),
        close: () => transport.close(),
      };
    },
  });
}
