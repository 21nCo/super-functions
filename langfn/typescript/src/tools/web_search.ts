import { Tool, type ToolSchema } from "./base.js";

export interface WebSearchArgs {
  query: string;
}

const webSearchSchema: ToolSchema<WebSearchArgs> = {
  jsonSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to run."
      }
    },
    required: ["query"]
  },
  parse(data: unknown): WebSearchArgs {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Expected web_search args object");
    }
    const query = (data as Record<string, unknown>).query;
    if (typeof query !== "string") {
      throw new Error("Expected query to be a string");
    }
    return { query };
  }
};

export const WebSearchTool = new Tool<WebSearchArgs, unknown>({
  name: "web_search",
  description: "Search the web using the configured backend.",
  schema: webSearchSchema,
  execute: async (args, context) => {
    const backend = context.policy.requireSearchBackend();
    return await backend(args.query);
  }
});
