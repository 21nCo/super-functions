import { Tool, type ToolSchema } from "./base.js";

export interface CodeExecArgs {
  code: string;
}

const codeExecSchema: ToolSchema<CodeExecArgs> = {
  jsonSchema: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "The code snippet to run in the configured sandbox."
      }
    },
    required: ["code"]
  },
  parse(data: unknown): CodeExecArgs {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Expected code_exec args object");
    }
    const code = (data as Record<string, unknown>).code;
    if (typeof code !== "string") {
      throw new Error("Expected code to be a string");
    }
    return { code };
  }
};

export const CodeExecTool = new Tool<CodeExecArgs, unknown>({
  name: "code_exec",
  description: "Execute code using the configured sandbox.",
  schema: codeExecSchema,
  execute: async (args, context) => {
    const sandbox = context.policy.requireSandbox();
    return await sandbox(args.code);
  }
});
