import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  Transport,
  TransportSendOptions
} from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";

export interface SSEMCPTransportOptions {
  url: string;
  fetchImpl?: typeof fetch;
  headers?: HeadersInit;
}

/**
 * Compatibility name for LangFn's HTTP transport. The implementation now uses
 * MCP Streamable HTTP from the official SDK rather than the legacy one-shot SSE shape.
 */
export class SSEMCPTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;

  private readonly delegate: StreamableHTTPClientTransport;

  constructor(options: SSEMCPTransportOptions) {
    this.delegate = new StreamableHTTPClientTransport(new URL(options.url), {
      ...(options.fetchImpl ? { fetch: options.fetchImpl } : {}),
      ...(options.headers ? { requestInit: { headers: options.headers } } : {})
    });
  }

  get sessionId(): string | undefined {
    return this.delegate.sessionId;
  }

  async start(): Promise<void> {
    this.delegate.onmessage = (message: JSONRPCMessage) => this.onmessage?.(message);
    this.delegate.onerror = (error) => this.onerror?.(error);
    this.delegate.onclose = () => this.onclose?.();
    await this.delegate.start();
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    await this.delegate.send(message, options);
  }

  async close(): Promise<void> {
    await this.delegate.close();
  }

  setProtocolVersion(version: string): void {
    this.delegate.setProtocolVersion(version);
  }
}
