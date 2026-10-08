import { expect, it } from "vitest";
import { validateDevFnConfig, validateDevFnPolicy } from "../src/index.js";

function config(route: Record<string, unknown>) {
  return { version: 1, project: { id: "fixture" }, ports: { app: {} }, profiles: { default: { proxy: true } }, hostnames: { app: { target: "app", ...route } } };
}

it("keeps arbitrary domains out of manifest hostnames and restricts domain references to registry names", () => {
  expect(() => validateDevFnConfig(config({ hostname: "app.example.test" }))).toThrow(/localhost/);
  expect(() => validateDevFnConfig(config({ domain: "example.test.evil.test", hostname: "app.localhost" }))).toThrow(/both/);
  expect(() => validateDevFnConfig(config({ domain: "example.test", tls: "internal" }))).toThrow(/controlled/);
  expect(() => validateDevFnConfig(config({ domain: "example.test", host: "app", path: "/api", match: "prefix", stripPrefix: true }))).not.toThrow();
  expect(() => validateDevFnConfig(config({ domain: "example.test", host: "app.example" }))).toThrow(/one DNS label/);
});

it("rejects ambiguous URL paths and deceptive localhost policy suffixes", () => {
  expect(() => validateDevFnConfig(config({ path: "/api%2fadmin" }))).toThrow(/unambiguous/);
  expect(() => validateDevFnConfig(config({ path: "/api", match: "exact", stripPrefix: true }))).toThrow(/prefix/);
  expect(() => validateDevFnPolicy({ version: 1, hostnameSuffix: ".localhost.evil.test" })).toThrow(/localhost/);
  expect(validateDevFnPolicy({ version: 1, hostnameSuffix: ".Corp.localhost" }).hostnameSuffix).toBe(".Corp.localhost");
  expect(validateDevFnPolicy({ version: 1, hostnameSuffix: ".LOCALHOST" }).hostnameSuffix).toBe(".LOCALHOST");
  expect(() => validateDevFnPolicy({ version: 1, hostnameSuffix: ".Corp.localhost.evil.test" })).toThrow(/localhost/);
});

it("validates inferred registered-domain labels while loading the manifest", () => {
  const withKey = (key: string, host?: string) => ({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    profiles: { default: { proxy: true } }, hostnames: { [key]: { target: "app", domain: "dev.example.test", ...(host ? { host } : {}) } } });
  expect(() => validateDevFnConfig(withKey("a".repeat(40)))).not.toThrow();
  expect(() => validateDevFnConfig(withKey("a".repeat(41)))).toThrow(/host label/);
  expect(() => validateDevFnConfig(withKey("api_v2"))).toThrow(expect.objectContaining({ path: "hostnames.api_v2" }));
  expect(() => validateDevFnConfig(withKey("api_v2", "api"))).not.toThrow();
});
