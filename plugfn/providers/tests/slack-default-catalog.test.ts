import { expect, it } from "vitest";
import { slackProvider, slackUserProvider } from "../src/slack/index.js";
it("exposes user-only search solely with delegated-user authorization", () => {
  expect(slackProvider.actions["search.messages"]).toBeUndefined();
  expect(
    slackUserProvider.actions["search.messages"].contract?.requiredScopes,
  ).toContain("search:read");
  expect(slackUserProvider.auth.config).toMatchObject({
    scopeParameter: "user_scope",
    scopes: expect.arrayContaining(["search:read"]),
  });
  expect(slackProvider.actions["messages.post"]).toBeDefined();
});
