import { describe, expect, it } from "vitest";

import {
  McpFnRegistry,
  McpFnValidationError,
  formatValidationIssues,
} from "../src/index.js";

describe("formatValidationIssues", () => {
  it("retains the rejected additional property, instance path, schema path, and keyword", async () => {
    const issues = await captureIssues({
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    }, {
      value: "ok",
      unexpected: "nope",
    });
    expect(issues).toEqual([
      expect.objectContaining({
        path: "/",
        schemaPath: "#/additionalProperties",
        keyword: "additionalProperties",
        rejectedProperty: "unexpected",
      }),
    ]);
    expect(issues[0]?.message).toMatch(/additional properties/i);
  });

  it("retains nested additional-property names", async () => {
    const issues = await captureIssues({
      type: "object",
      properties: {
        child: {
          type: "object",
          properties: { value: { type: "string" } },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    }, {
      child: { value: "ok", extra: true },
    });
    expect(issues).toEqual([
      expect.objectContaining({
        path: "/child",
        schemaPath: "#/properties/child/additionalProperties",
        keyword: "additionalProperties",
        rejectedProperty: "extra",
      }),
    ]);
  });

  it("caps and stably sorts validation issues", () => {
    const issues = formatValidationIssues([
      {
        instancePath: "/b",
        schemaPath: "#/properties/b",
        keyword: "type",
        params: {},
        message: "must be string",
      },
      {
        instancePath: "/a",
        schemaPath: "#/additionalProperties",
        keyword: "additionalProperties",
        params: { additionalProperty: "z" },
        message: "must NOT have additional properties",
      },
      {
        instancePath: "/a",
        schemaPath: "#/additionalProperties",
        keyword: "additionalProperties",
        params: { additionalProperty: "m" },
        message: "must NOT have additional properties",
      },
    ] as never);
    expect(issues.map((issue) => `${issue.path}:${issue.rejectedProperty ?? issue.keyword}`)).toEqual([
      "/a:m",
      "/a:z",
      "/b:type",
    ]);
  });
});

async function captureIssues(
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  },
  args: Record<string, unknown>,
) {
  const registry = new McpFnRegistry().register({
    name: "strict_tool",
    description: "Reject unknown properties.",
    inputSchema,
    handler: async () => ({ content: [] }),
  });
  try {
    await registry.callTool("strict_tool", args, undefined, {} as never);
    throw new Error("expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(McpFnValidationError);
    const details = (error as McpFnValidationError).details as { issues: ReturnType<typeof formatValidationIssues> };
    return details.issues;
  }
}
