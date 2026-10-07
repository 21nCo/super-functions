import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { MCPProtocolError } from "../core/errors.js";
import type { MCPTool, MCPTransport } from "./types.js";

export class MCPClient {
  private readonly client = new Client(
    { name: "langfn-mcp-client", version: "0.1.0" },
    { capabilities: {} }
  );
  private connected = false;
  private connectionPromise?: Promise<void>;

  constructor(readonly transport: MCPTransport) {}

  async listTools(): Promise<MCPTool[]> {
    await this.ensureConnected();
    const tools: Awaited<ReturnType<Client["listTools"]>>["tools"] = [];
    let cursor: string | undefined;
    do {
      const result = await this.client.listTools(cursor ? { cursor } : undefined);
      tools.push(...result.tools);
      cursor = result.nextCursor;
    } while (cursor);
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      input_schema: tool.inputSchema as Record<string, unknown>
    }));
  }

  async callTool<T = unknown>(name: string, arguments_: Record<string, unknown> = {}): Promise<T> {
    await this.ensureConnected();
    let result: CallToolResult;
    try {
      result = await this.client.callTool({ name, arguments: arguments_ }) as CallToolResult;
    } catch (error) {
      if (error instanceof MCPProtocolError) throw error;
      throw new MCPProtocolError(
        error instanceof Error ? error.message : `MCP tool ${name} failed`,
        { cause: error },
      );
    }
    if (result.isError) {
      const message = result.content
        .filter((entry): entry is { type: "text"; text: string } => entry.type === "text")
        .map((entry) => entry.text)
        .join("\n") || `MCP tool ${name} failed`;
      throw new MCPProtocolError(message, { metadata: { result } });
    }
    if (
      result.structuredContent &&
      typeof result.structuredContent === "object" &&
      "result" in result.structuredContent
    ) {
      return result.structuredContent.result as T;
    }
    if (result.structuredContent !== undefined) {
      return result.structuredContent as T;
    }
    const text = result.content
      .filter((entry): entry is { type: "text"; text: string } => entry.type === "text")
      .map((entry) => entry.text);
    if (text.length === 1) {
      try {
        return JSON.parse(text[0]) as T;
      } catch {
        return text[0] as T;
      }
    }
    if (text.length > 1) return text.join("\n") as T;
    return result as T;
  }

  async close(): Promise<void> {
    await this.connectionPromise?.catch(() => undefined);
    if (!this.connected) return;
    await this.client.close();
    this.connected = false;
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    if (!this.connectionPromise) {
      this.connectionPromise = this.client.connect(this.transport)
        .then(() => { this.connected = true; })
        .catch((error: unknown) => {
          this.connectionPromise = undefined;
          throw error;
        });
    }
    await this.connectionPromise;
  }
}
