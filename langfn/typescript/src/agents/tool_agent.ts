import { LangFn } from "../client.js";
import { AgentMaxIterationsError, ToolExecutionError } from "../core/errors.js";
import { Tool } from "../tools/base.js";
import { Message } from "../core/types.js";

export interface ToolAgentResult {
  messages: Array<Message & Record<string, unknown>>;
  output: string;
}

export class ToolAgent {
  constructor(
    private options: {
      lang: LangFn;
      tools: Tool<any, any>[];
      max_iterations?: number;
    }
  ) {}

  async run(prompt: string, options: { system?: string } = {}): Promise<ToolAgentResult> {
    const max_iterations = this.options.max_iterations ?? 5;
    const messages: Array<Message & Record<string, unknown>> = [];
    if (options.system) {
      messages.push({ role: "system", content: options.system });
    }
    messages.push({ role: "user", content: prompt });

    const tool_map = Object.fromEntries(this.options.tools.map(t => [t.name, t]));
    const policy = this.options.lang.getSecurityPolicy();

    for (let i = 0; i < max_iterations; i++) {
      const resp = await this.options.lang.chat(messages, {
        tools: this.options.tools
      });

      const assistant_msg: Message & Record<string, unknown> = { ...resp.message };
      const toolCalls = resp.tool_calls ?? resp.toolCalls;
      if (toolCalls?.length) {
        assistant_msg.tool_calls = toolCalls.map(c => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.arguments) }
        }));
      }
      messages.push(assistant_msg);

      if (!toolCalls || toolCalls.length === 0) {
        return { messages, output: resp.message.content };
      }

      for (const call of toolCalls) {
        const tool = tool_map[call.name];
        if (!tool) {
          throw new ToolExecutionError(`Unknown tool: ${call.name}`, {
            metadata: { tool: call.name }
          });
        }

        const result = await tool.run(call.arguments, {
          metadata: { toolCallId: call.id },
          policy
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result)
        });
      }
    }

    throw new AgentMaxIterationsError("Agent exceeded max iterations", {
      metadata: { max_iterations }
    });
  }
}
