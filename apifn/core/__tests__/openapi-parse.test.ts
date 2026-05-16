import { parseOpenAPI, validateOpenAPI } from "../src/index.js";

describe("parseOpenAPI", () => {
  it("TV-OPENAPI-011: parses JSON string", () => {
    const jsonInput = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "External API", version: "2.0.0" },
      paths: {
        "/items": {
          get: {
            responses: {
              "200": { description: "OK" },
            },
          },
        },
      },
    });

    const parsed = parseOpenAPI(jsonInput);
    expect(parsed.openapi).toBe("3.1.0");
    expect(parsed.info.title).toBe("External API");
  });

  it("TV-OPENAPI-011: parses YAML string", () => {
    const yamlInput = `
openapi: "3.1.0"
info:
  title: External API
  version: "2.0.0"
paths:
  /items:
    get:
      summary: List items
      responses:
        "200":
          description: OK
`;

    const parsed = parseOpenAPI(yamlInput);
    expect(parsed.openapi).toBe("3.1.0");
    expect(parsed.info.title).toBe("External API");
    expect(parsed.paths["/items"]?.get).toBeDefined();
  });

  it("TV-OPENAPI-011: parses object input", () => {
    const input = {
      openapi: "3.1.0",
      info: { title: "Object API", version: "1.0.0" },
      paths: {},
    };

    const parsed = parseOpenAPI(input);
    expect(parsed).toBe(input);
  });

  it("TV-OPENAPI-011 NEG: throws descriptive error for invalid input", () => {
    expect(() => parseOpenAPI("openapi: : : invalid")).toThrow(/failed to parse/i);
  });

  it("TV-OPENAPI-013: upconverts 3.0.x nullable schema to 3.1.0", async () => {
    const input = {
      openapi: "3.0.3",
      info: { title: "Old API", version: "1.0.0" },
      paths: {
        "/items": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: { type: "string", nullable: true, example: "x" },
                  },
                },
              },
            },
          },
        },
      },
    };

    const parsed = parseOpenAPI(input);

    expect(parsed.openapi).toBe("3.1.0");
    const schema = parsed.paths["/items"]?.get?.responses?.["200"]?.content?.[
      "application/json"
    ]?.schema as { type?: unknown; nullable?: unknown; example?: unknown };
    expect(schema.type).toEqual(["string", "null"]);
    expect(schema.nullable).toBeUndefined();
    expect(schema.example).toBe("x");

    await expect(validateOpenAPI(parsed)).resolves.toEqual([]);
  });

  it("does not invent a null-only type for nullable schemas without explicit type", () => {
    const input = {
      openapi: "3.0.3",
      info: { title: "Old API", version: "1.0.0" },
      paths: {
        "/items": {
          get: {
            responses: {
              "200": {
                description: "OK",
                content: {
                  "application/json": {
                    schema: { nullable: true, description: "Untyped nullable schema" },
                  },
                },
              },
            },
          },
        },
      },
    };

    const parsed = parseOpenAPI(input);
    const schema = parsed.paths["/items"]?.get?.responses?.["200"]?.content?.[
      "application/json"
    ]?.schema as { type?: unknown; nullable?: unknown; description?: unknown };

    expect(schema.type).toBeUndefined();
    expect(schema.nullable).toBeUndefined();
    expect(schema.description).toBe("Untyped nullable schema");
  });
});
