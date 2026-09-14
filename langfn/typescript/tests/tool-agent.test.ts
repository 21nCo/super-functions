import { afterEach, describe, expect, it } from "vitest";

import { LangFn } from "../src/client.js";
import {
  NotConfiguredError,
  ToolDisabledError,
  ToolExecutionError,
  ToolPolicyViolationError,
  ToolSchemaError
} from "../src/core/errors.js";
import { AnthropicChatModel, MockChatModel, OpenAIChatModel } from "../src/models/index.js";
import { Tool, type ToolContext, type ToolSchema } from "../src/tools/base.js";
import {
  ApiCallTool,
  CalculatorTool,
  CodeExecTool,
  ToolPolicy,
  WebSearchTool,
  calculator,
  redactSensitiveFields,
  sanitizeOutput
} from "../src/tools/index.js";

interface AddArgs {
  a: number;
  b: number;
}

const addSchema: ToolSchema<AddArgs> = {
  jsonSchema: {
    type: "object",
    properties: {
      a: { type: "integer" },
      b: { type: "integer" }
    },
    required: ["a", "b"]
  },
  parse(data: unknown): AddArgs {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Expected add args object");
    }
    const { a, b } = data as Record<string, unknown>;
    if (typeof a !== "number" || !Number.isInteger(a)) {
      throw new Error("Expected a to be an integer");
    }
    if (typeof b !== "number" || !Number.isInteger(b)) {
      throw new Error("Expected b to be an integer");
    }
    return { a, b };
  }
};

async function add(args: AddArgs, _context: ToolContext): Promise<number> {
  return args.a + args.b;
}

describe("tool agent and secure tools", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("runs tools and preserves tool call history", async () => {
    let calls = 0;
    const model = new MockChatModel({
      chat: async (request) => {
        calls += 1;
        if (calls === 1) {
          return {
            message: { role: "assistant", content: "" },
            tool_calls: [{ id: "call_1", name: "add", arguments: { a: 2, b: 3 } }]
          };
        }

        const toolMessage = request.messages.find((message) => message.role === "tool");
        const result = JSON.parse(toolMessage?.content ?? "0");
        return {
          message: { role: "assistant", content: `Result is ${result}` }
        };
      }
    });
    const agent = await new LangFn({ model }).createToolAgent(
      [new Tool({ name: "add", description: "Add", schema: addSchema, execute: add })],
      { max_iterations: 3 }
    );

    const output = await agent.run("what is 2 + 3?");

    expect(output.output).toBe("Result is 5");
    expect(output.messages.some((message) => message.role === "tool" && message.tool_call_id === "call_1")).toBe(true);
    const assistant = output.messages.find((message) => message.role === "assistant" && Array.isArray(message.tool_calls));
    expect((assistant?.tool_calls as Array<Record<string, unknown>>)[0]?.id).toBe("call_1");
  });

  it("raises canonical tool errors for invalid args and unknown tools", async () => {
    const invalidAgent = await new LangFn({
      model: new MockChatModel({
        chat: async () => ({
          message: { role: "assistant", content: "" },
          tool_calls: [{ id: "call_1", name: "add", arguments: { a: "bad", b: 3 } }]
        })
      })
    }).createToolAgent([new Tool({ name: "add", description: "Add", schema: addSchema, execute: add })], {
      max_iterations: 1
    });

    await expect(invalidAgent.run("bad")).rejects.toBeInstanceOf(ToolSchemaError);
    await expect(invalidAgent.run("bad")).rejects.toMatchObject({ code: "TOOL_SCHEMA_ERROR" });

    const missingAgent = await new LangFn({
      model: new MockChatModel({
        chat: async () => ({
          message: { role: "assistant", content: "" },
          tool_calls: [{ id: "call_1", name: "missing", arguments: {} }]
        })
      })
    }).createToolAgent([], { max_iterations: 1 });

    await expect(missingAgent.run("bad")).rejects.toBeInstanceOf(ToolExecutionError);
    await expect(missingAgent.run("bad")).rejects.toMatchObject({ code: "TOOL_EXECUTION_ERROR" });
  });

  it("serializes provider-native tool payloads and anthropic tool transcripts", async () => {
    const observed: Record<string, any> = {};
    const openaiFetch: typeof fetch = async (_input, init) => {
      observed.openai = JSON.parse(String(init?.body ?? "{}"));
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "done" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const anthropicFetch: typeof fetch = async (_input, init) => {
      observed.anthropic = JSON.parse(String(init?.body ?? "{}"));
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "done" }],
          usage: { input_tokens: 1, output_tokens: 1 }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const tools = [new Tool({ name: "add", description: "Add", schema: addSchema, execute: add })];

    await new LangFn({
      model: new OpenAIChatModel({ apiKey: "sk-test", fetchImpl: openaiFetch })
    }).chat([{ role: "user", content: "2+3?" }], { tools });
    await new LangFn({
      model: new AnthropicChatModel({ apiKey: "sk-test", fetchImpl: anthropicFetch })
    }).chat(
      [
        { role: "user", content: "2+3?" },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "add", arguments: "{\"a\":2,\"b\":3}" }
            }
          ]
        } as any,
        { role: "tool", tool_call_id: "call_1", content: "5" }
      ],
      { tools }
    );

    expect(observed.openai.tools[0].function.parameters.properties.a.type).toBe("integer");
    expect(observed.anthropic.tools[0].input_schema.properties.a.type).toBe("integer");
    expect(observed.anthropic.messages[1].content[0].type).toBe("tool_use");
    expect(observed.anthropic.messages[2].content[0].tool_use_id).toBe("call_1");
  });

  it("enforces built-in tool safety, secret hooks, redaction, and sanitization", async () => {
    expect(calculator("2 + 2")).toBe("4");
    await expect(CalculatorTool.run({ expression: "__import__('os')" })).rejects.toBeInstanceOf(
      ToolPolicyViolationError
    );

    const baselineContext = { metadata: {}, policy: new ToolPolicy() };
    await expect(
      ApiCallTool.run({ url: "http://169.254.169.254/latest/meta-data" }, baselineContext)
    ).rejects.toMatchObject({ code: "TOOL_POLICY_VIOLATION" });
    await expect(CodeExecTool.run({ code: "console.log('hi')" }, baselineContext)).rejects.toBeInstanceOf(
      ToolDisabledError
    );
    await expect(WebSearchTool.run({ query: "langfn" }, baselineContext)).rejects.toBeInstanceOf(
      NotConfiguredError
    );

    let observedAuthorization = "";
    globalThis.fetch = (async (_input, init) => {
      observedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
      return new Response("<script>alert(1)</script>", {
        status: 200,
        headers: { "content-type": "text/plain" }
      });
    }) as typeof fetch;

    const secureContext = {
      metadata: {},
      policy: new ToolPolicy({
        secretProvider: (secretRef) => (secretRef === "SERVICE_TOKEN" ? "top-secret" : undefined),
        allowedHosts: ["api.example.com"]
      })
    };
    await expect(
      ApiCallTool.run(
        { url: "https://api.example.com/data", auth_secret_ref: "SERVICE_TOKEN" },
        secureContext
      )
    ).resolves.toBe("safe string");
    expect(observedAuthorization).toBe("Bearer top-secret");

    const searchContext = {
      metadata: {},
      policy: new ToolPolicy({
        searchBackend: async () => "<script>alert(1)</script>"
      })
    };
    await expect(WebSearchTool.run({ query: "langfn" }, searchContext)).resolves.toBe("safe string");

    expect(redactSensitiveFields({ authorization: "Bearer secret", ssn: "111-22-3333" })).toEqual({
      authorization: "***REDACTED***",
      ssn: "***REDACTED***"
    });
    expect(sanitizeOutput("<script>alert(1)</script>")).toBe("safe string");
    await expect(new OpenAIChatModel({ apiKeyRef: "OPENAI_API_KEY" }).complete({ prompt: "ping" })).rejects.toBeInstanceOf(
      NotConfiguredError
    );
  });
});
