import { LangFn } from "../client.js";
import { AgentMaxIterationsError, ToolExecutionError } from "../core/errors.js";
import { Message } from "../core/types.js";
import { Tool } from "../tools/base.js";

export interface ReActResult {
  messages: Array<Message & Record<string, unknown>>;
  output: string;
}

export class ReActAgent {
  constructor(
    private options: {
      model: LangFn;
      tools: Tool<any, any>[];
      max_iterations?: number;
      system_prompt?: string;
    }
  ) {}

  async run(prompt: string): Promise<ReActResult> {
    const maxIterations = this.options.max_iterations ?? 10;
    const systemPrompt =
      this.options.system_prompt ??
      "You are a helpful assistant with access to tools. Use them to answer the user's request.";
    const messages: Array<Message & Record<string, unknown>> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ];
    const toolMap = Object.fromEntries(this.options.tools.map((tool) => [tool.name, tool]));
    const policy = this.options.model.getSecurityPolicy();

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const response = await this.options.model.chat(messages, {
        tools: this.options.tools,
        tool_choice: "auto"
      });
      const toolCalls = response.tool_calls ?? response.toolCalls;
      const assistantMessage: Message & Record<string, unknown> = { ...response.message };
      if (toolCalls?.length) {
        assistantMessage.tool_calls = toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) }
        }));
      }
      messages.push(assistantMessage);

      if (!toolCalls?.length) {
        return { messages, output: response.message.content };
      }

      for (const call of toolCalls) {
        const tool = toolMap[call.name];
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
          content: typeof result === "string" ? result : JSON.stringify(result)
        });
      }
    }

    throw new AgentMaxIterationsError("Agent exceeded max iterations", {
      metadata: { max_iterations: maxIterations }
    });
  }
}
