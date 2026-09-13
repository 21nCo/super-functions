import { render, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { selectApiReferenceRoute } from "@docsfn/core";
import { ApiReferenceRenderer } from "./ApiReferenceRenderer";
import type { ApiReference } from "@docsfn/core";

function createApiReferenceFixture(): ApiReference {
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
        description: "API for indexing/search",
      },
      operations: [
        {
          id: "get:/search",
          method: "GET",
          methodLower: "get",
          path: "/search",
          routePath: "/docs/api/operations/get-search",
          summary: "Search docs",
          tags: ["search"],
          parameters: [],
          responses: [{ statusCode: "200", description: "ok", content: [] }],
          deprecated: false,
        },
        {
          id: "post:/index",
          method: "POST",
          methodLower: "post",
          path: "/index",
          routePath: "/docs/api/operations/post-index",
          summary: "Index document",
          tags: ["indexing"],
          parameters: [
            {
              name: "x-org-id",
              in: "header",
              required: true,
              schemaType: "string",
            },
          ],
          requestBody: {
            required: true,
            content: [
              {
                mediaType: "application/json",
                example: { id: "doc_1", text: "hello" },
                examples: [],
              },
            ],
          },
          responses: [{ statusCode: "202", description: "accepted", content: [] }],
          deprecated: false,
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

describe("ApiReferenceRenderer", () => {
  it("renders canonical operation and schema ordering", () => {
    const html = renderToStaticMarkup(<ApiReferenceRenderer api={createApiReferenceFixture()} />);

    expect(html).toContain("Search API");
    expect(html).toContain("/docs/api/operations/get-search");
    expect(html).toContain("/docs/api/operations/post-index");
    expect(html.indexOf("/docs/api/operations/get-search")).toBeLessThan(
      html.indexOf("/docs/api/operations/post-index")
    );
    expect(html).toContain("IndexRequest");
  });
});

it("expands the operation selected by the canonical route helper", () => {
  const api = createApiReferenceFixture();
  const selected = selectApiReferenceRoute(api, "/docs/api/operations/get-search");
  expect(selected.path).toBe("/docs/api/operations/get-search");
  expect(renderToStaticMarkup(<ApiReferenceRenderer api={selected} />)).toContain('aria-expanded="true"');
});

it.each([false, true])("shows media schemas and named examples in request and response tabs (raw=%s)", (raw) => {
  const api = createApiReferenceFixture();
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
  const view = render(<ApiReferenceRenderer api={api} />);
  try {
    if (raw) fireEvent.click(view.getByRole("button", { expanded: false }));
    for (const name of ["Request", "Responses"]) {
      fireEvent.click(view.getByRole("tab", { name }));
      const side = name === "Request" ? "request" : "response";
      const text = view.getByRole("tabpanel").textContent;
      for (const suffix of ["Field", "-sample", "-value", "-single"]) expect(text).toContain(side + suffix);
      expect(text).not.toContain((side === "request" ? "response" : "request") + "Field");
    }
  } finally { cleanup(); }
});
