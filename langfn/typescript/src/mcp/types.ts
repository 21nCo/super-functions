import type { Readable, Writable } from "node:stream";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

/** Backward-compatible LangFn view of an MCP tool descriptor. */
export interface MCPTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** MCP transports now use the official SDK transport contract. */
export type MCPTransport = Transport;

export interface ListToolsResult {
  tools: MCPTool[];
}

export interface CallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

/** Injectable stdio streams are retained for tests and embedded runtimes. */
export interface MCPStreamEndpoint {
  input: Readable;
  output: Writable;
  close?: () => Promise<void> | void;
}
