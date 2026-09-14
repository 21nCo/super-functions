import { expect, it, vi } from "vitest";
import { jiraProvider } from "../src/jira/index.js";
it("accepts public site selection and removes routing input before provider dispatch", async () => {
  const get = vi
    .fn()
    .mockResolvedValueOnce({
      data: [{ id: "site", scopes: ["read:jira-work"] }],
    })
    .mockResolvedValueOnce({ status: 200, data: { values: [] } });
  await jiraProvider.actions["projects.list"].execute(
    { cloudId: "site", maxResults: 10 },
    { http: { get } } as any,
  );
  expect(get).toHaveBeenNthCalledWith(
    1,
    "https://api.atlassian.com/oauth/token/accessible-resources",
    { redirect: "error" },
  );
  expect(get.mock.calls[1][0]).toBe(
    "https://api.atlassian.com/ex/jira/site/rest/api/3/project/search",
  );
  expect(get.mock.calls[1][1].params).toEqual({ maxResults: 10 });
});
it.each(
  [
    [],
    [{ id: "other", scopes: ["read:jira-work"] }],
    [{ id: "site", scopes: [] }],
  ].map((resources) => [resources]),
)("rejects a site outside the credential grant", async (resources) => {
  const get = vi.fn().mockResolvedValue({ data: resources });
  await expect(
    jiraProvider.actions["projects.list"].execute({ cloudId: "site" }, {
      http: { get },
    } as any),
  ).rejects.toThrow();
  expect(get).toHaveBeenCalledTimes(1);
});
