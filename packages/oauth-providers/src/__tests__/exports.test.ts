import { describe, expect, it } from "vitest";
import {
  getOAuthProviderDescriptor,
  getProviderPolicy,
  listOAuthProviderDescriptors,
} from "../index.js";

describe("oauth-providers exports", () => {
  it("returns known providers", () => {
    expect(getOAuthProviderDescriptor("google").id).toBe("google");
    expect(listOAuthProviderDescriptors().length).toBeGreaterThan(0);
  });

  it("returns cloned provider descriptors so callers cannot mutate shared registry state", () => {
    const descriptor = getOAuthProviderDescriptor("google");
    descriptor.defaultScopes.push("mutated");
    descriptor.extraAuthParams = { prompt: "consent" };

    expect(getOAuthProviderDescriptor("google").defaultScopes).toEqual(["openid", "email", "profile"]);
    expect(getOAuthProviderDescriptor("google").extraAuthParams).toBeUndefined();
  });

  it("returns cloned provider policies so callers cannot mutate shared policy state", () => {
    const policy = getProviderPolicy("google");
    policy.operationPolicies["mail.send"]!.allowed = false;
    policy.featureScopes["mail.send"]!.allowedScopes.push("mutated");

    expect(getProviderPolicy("google").operationPolicies["mail.send"]?.allowed).toBe(true);
    expect(getProviderPolicy("google").featureScopes["mail.send"]?.allowedScopes).not.toContain("mutated");
  });
});
