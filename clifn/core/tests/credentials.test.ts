import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCredentialStore, MissingProfileError } from "../src/credentials.js";

describe("credentials", () => {
  it("persists and reads profiles", () => {
    const dir = mkdtempSync(join(tmpdir(), "clifn-credentials-"));
    const filePath = join(dir, "credentials.ini");
    const store = createCredentialStore(filePath);

    store.setProfile("default", {
      backend: "https://api.conduct.sh",
      key: "sk_live_123",
    });

    expect(store.hasProfile("default")).toBe(true);
    expect(store.listProfiles()).toEqual(["default"]);
    expect(store.getProfile("default")).toEqual({
      backend: "https://api.conduct.sh",
      key: "sk_live_123",
    });

    const raw = readFileSync(filePath, "utf8");
    expect(raw).toContain("[default]");
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(filePath).mode & 0o777).toBe(0o600);
  });

  it("throws typed error for missing profiles", () => {
    const dir = mkdtempSync(join(tmpdir(), "clifn-credentials-missing-"));
    const filePath = join(dir, "credentials.ini");
    const store = createCredentialStore(filePath);

    expect(() => store.getProfile("missing")).toThrow(MissingProfileError);
  });
});
