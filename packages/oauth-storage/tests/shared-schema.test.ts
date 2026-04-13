import { describe, expect, it } from "vitest";
import { getOAuthStorageSchema, getOAuthStorageTableDefinitions } from "../src/index.js";

describe("oauth-storage shared schema inventory", () => {
  it("publishes deterministic abstract table definitions for shared OAuth stores", () => {
    const definitions = getOAuthStorageTableDefinitions();
    expect(definitions.map((definition) => definition.name)).toEqual([
      "oauth_states",
      "oauth_tokens",
      "oauth_consents",
      "oauth_revocation_failures"
    ]);

    expect(definitions.find((definition) => definition.name === "oauth_consents")?.indexes).toEqual([
      {
        name: "idx_oauth_consents_provider_subject",
        fields: ["provider_id", "subject_key"]
      }
    ]);
  });

  it("renders deterministic SQL schema statements for all shared OAuth tables", () => {
    const statements = getOAuthStorageSchema();

    expect(statements.join("\n")).toContain("CREATE TABLE IF NOT EXISTS oauth_states");
    expect(statements.join("\n")).toContain("CREATE TABLE IF NOT EXISTS oauth_tokens");
    expect(statements.join("\n")).toContain("CREATE TABLE IF NOT EXISTS oauth_consents");
    expect(statements.join("\n")).toContain("CREATE TABLE IF NOT EXISTS oauth_revocation_failures");
  });
});
