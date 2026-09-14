import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type {
  Transport,
  TransportSendOptions
} from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";

import { MCPTransportError } from "../core/errors.js";
import type { MCPStreamEndpoint } from "./types.js";

export interface StdioMCPTransportOptions {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  streams?: MCPStreamEndpoint;
  closeTimeoutMs?: number;
}

/**
 * Official SDK transport for spawned processes, with an SDK-compatible stream
 * adapter retained for embedded LangFn tests and hosts.
 */
export class StdioMCPTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;

  private readonly readBuffer = new ReadBuffer();
  private delegate?: StdioClientTransport;
  private started = false;
  private closed = false;

  constructor(private readonly options: StdioMCPTransportOptions) {}

  async start(): Promise<void> {
    if (this.started) throw new MCPTransportError("MCP stdio transport is already started");
    this.started = true;

    const endpoint = this.options.streams;
    if (endpoint) {
      endpoint.input.on("data", this.handleData);
      endpoint.input.on("error", this.handleError);
      endpoint.input.on("end", this.handleClose);
      endpoint.input.on("close", this.handleClose);
      return;
    }

    if (this.options.command) {
      this.delegate = new StdioClientTransport({
        command: this.options.command,
        ...(this.options.args ? { args: this.options.args } : {}),
        ...(this.options.env ? { env: this.options.env } : {}),
        stderr: "inherit"
      });
      this.delegate.onmessage = (message: JSONRPCMessage) => this.onmessage?.(message);
      this.delegate.onerror = (error) => this.onerror?.(error);
      this.delegate.onclose = () => this.notifyClosed();
      await this.delegate.start();
      return;
    }

    throw new MCPTransportError("StdioMCPTransport requires command or streams");
  }

  async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    void _options; // Stdio has no resumable-event or related-request framing.
    if (!this.started || this.closed) {
      throw new MCPTransportError("MCP stdio transport is not started or is closed");
    }
    if (this.delegate) {
      await this.delegate.send(message);
      return;
    }
    const endpoint = this.options.streams;
    if (!endpoint) {
      throw new MCPTransportError("MCP stdio transport is not started");
    }
    await new Promise<void>((resolve, reject) => {
      endpoint.output.write(serializeMessage(message), (error?: Error | null) => {
        if (error) reject(new MCPTransportError("Failed to write MCP stdio message", { cause: error }));
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    if (this.delegate) {
      try {
        await withTimeout(
          this.delegate.close(),
          this.options.closeTimeoutMs ?? 250,
          "MCP stdio process shutdown timed out"
        );
      } finally {
        this.notifyClosed();
      }
      return;
    }

    const endpoint = this.options.streams;
    if (endpoint) {
      endpoint.input.off("data", this.handleData);
      endpoint.input.off("error", this.handleError);
      endpoint.input.off("end", this.handleClose);
      endpoint.input.off("close", this.handleClose);
      if (endpoint.close) {
        await withTimeout(
          Promise.resolve(endpoint.close()),
          this.options.closeTimeoutMs ?? 250,
          "MCP stream shutdown timed out"
        );
      } else if (!endpoint.output.destroyed) {
        endpoint.output.end();
      }
    }
    this.notifyClosed();
  }

  private readonly handleData = (chunk: Buffer | string): void => {
    this.readBuffer.append(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    try {
      let message = this.readBuffer.readMessage();
      while (message) {
        this.onmessage?.(message);
        message = this.readBuffer.readMessage();
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  private readonly handleError = (error: Error): void => {
    this.onerror?.(error);
  };

  private readonly handleClose = (): void => {
    this.notifyClosed();
  };

  private notifyClosed(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new MCPTransportError(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
