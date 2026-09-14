import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, expect, it } from "vitest";
import ApiReferenceRenderer from "./ApiReferenceRenderer.svelte";
afterEach(cleanup);
it("activates real UIFn request and response tabs before rendering payloads", async () => {
  const view = render(ApiReferenceRenderer, { api: {
    kind: "api", id: "api:test", slug: "test", path: "/api/test", title: "Test API", frontmatter: {},
    spec: { info: { title: "Test API", version: "1" }, paths: { "/example": { post: {
      requestBody: { content: { "application/json": { schema: { type: "object", required: ["requestField"] } } } },
      responses: { "200": { description: "Success", content: { "application/json": { schema: { type: "object", required: ["responseField"] } } } } },
    } } } },
  } });
  await fireEvent.click(view.getByRole("button", { name: /POST/ }));
  const request = view.getByRole("tab", { name: "Request" });
  await fireEvent.click(request);
  await waitFor(() => expect(request.getAttribute("aria-selected")).toBe("true"));
  expect(view.getByRole("tabpanel").textContent).toContain("requestField");
  const responses = view.getByRole("tab", { name: "Responses" });
  await fireEvent.click(responses);
  await waitFor(() => expect(responses.getAttribute("aria-selected")).toBe("true"));
  expect(request.getAttribute("aria-selected")).toBe("false");
  expect(view.getByRole("tabpanel").textContent).toContain("responseField");
});
