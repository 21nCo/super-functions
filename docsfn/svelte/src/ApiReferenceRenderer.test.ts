import { render, cleanup, fireEvent } from "@testing-library/svelte";
import ApiReferenceRenderer from "./ApiReferenceRenderer.svelte";
import { describe, expect, it } from "vitest";
import type { ApiReference } from "@docsfn/core";

function createCanonicalApiFixture(): ApiReference {
  return {
    kind: "api",
    id: "api:index.json",
    slug: "",
    path: "/docs/api",
    title: "Search API",
    frontmatter: {},
    spec: {
      info: {
        title: "Search API",
        version: "1.0.0",
      },
      operations: [
        {
          id: "get:/search",
          method: "GET",
          path: "/search",
          routePath: "/docs/api/operations/get-search",
          parameters: [],
          responses: [{ statusCode: "200", description: "ok", content: [] }],
        },
        {
          id: "post:/index",
          method: "POST",
          path: "/index",
          routePath: "/docs/api/operations/post-index",
          parameters: [
            {
              name: "x-org-id",
              in: "header",
              required: true,
              schemaType: "string",
            },
          ],
          requestBody: {
            content: [
              {
                mediaType: "application/json",
                example: { id: "doc_1", text: "hello" },
              },
            ],
          },
          responses: [{ statusCode: "202", description: "accepted", content: [] }],
        },
      ],
      schemas: [
        {
          name: "IndexRequest",
          routePath: "/docs/api/schemas/indexrequest",
          description: "Index payload",
          schema: { type: "object" },
        },
      ],
      tags: [
        { name: "indexing", routePath: "/docs/api/tags/indexing" },
        { name: "search", routePath: "/docs/api/tags/search" },
      ],
    },
  };
}

describe("ApiReferenceRenderer canonical model contract", () => {
  it("preserves deterministic operation and schema order for renderer parity", () => {
    const api = createCanonicalApiFixture();

    const operationRoutes = (api.spec as { operations: Array<{ routePath: string }> }).operations.map(
      (operation) => operation.routePath
    );
    expect(operationRoutes).toEqual([
      "/docs/api/operations/get-search",
      "/docs/api/operations/post-index",
    ]);

    const schemaNames = (api.spec as { schemas: Array<{ name: string }> }).schemas.map(
      (schema) => schema.name
    );
    expect(schemaNames).toEqual(["IndexRequest"]);
  });
});

it.each([false, true])("renders operation media schemas and named examples (raw=%s)", async (raw) => {
  const api = createCanonicalApiFixture();
  const operation = api.spec.operations[1];
  api.path = operation.routePath;
  const media = (side: string) => ({ mediaType: "application/json", schema: { type: "object", properties: { [side + "Field"]: { type: "string" } } }, example: side + "-single", examples: [{ name: side + "-sample", value: side + "-value" }] });
  operation.requestBody.content = [media("request")];
  operation.responses = [{ statusCode: "200", content: [media("response")] }];
  if (raw) {
    const rawContent = (side: string) => { const item = media(side); return { [item.mediaType]: { ...item, examples: Object.fromEntries(item.examples.map(example => [example.name, { $ref: `#/components/examples/${side}` }])) } }; };
    api.path = "/docs/api/operations/post-x";
    api.spec = { openapi: "3.0.3", components: { examples: { request: { value: "request-value" }, response: { value: "response-value" } } }, info: { title: "Raw", version: "1" }, paths: { "/x": { post: { requestBody: { content: rawContent("request") }, responses: { "200": { content: rawContent("response") } } } } } };
  }
  const view = render(ApiReferenceRenderer, { api });
  try {
    if (raw) await fireEvent.click(view.getByRole("button", { expanded: false }));
    for (const side of ["request", "response"]) for (const suffix of ["Field", "-sample", "-value", "-single"]) expect(view.container.textContent).toContain(side + suffix);
  } finally { cleanup(); }
});
