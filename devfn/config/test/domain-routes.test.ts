import { expect, it } from "vitest";
import { validateDevFnConfig, validateDevFnPolicy } from "../src/index.js";

function config(route: Record<string, unknown>) {
  return { version: 1, project: { id: "fixture" }, ports: { app: {} }, profiles: { default: { proxy: true } }, hostnames: { app: { target: "app", ...route } } };
}

it("keeps arbitrary domains out of manifest hostnames and restricts domain references to registry names", () => {
  expect(() => validateDevFnConfig(config({ hostname: "app.example.test" }))).toThrow(/localhost/);
  expect(() => validateDevFnConfig(config({ domain: "example.test.evil.test", hostname: "app.localhost" }))).toThrow(/both/);
  expect(() => validateDevFnConfig(config({ domain: "example.test", tls: "internal" }))).toThrow(/controlled/);
  expect(() => validateDevFnConfig(config({ domain: "example.test", tls: "off" }))).toThrow(/controlled/);
  expect(() => validateDevFnConfig(config({ domain: "example.test", host: "app", path: "/api", match: "prefix", stripPrefix: true }))).not.toThrow();
  const registered = validateDevFnConfig(config({ domain: "example.test" }));
  expect(registered.hostnames?.app.tls).toBeUndefined();
  expect(() => validateDevFnConfig(registered)).not.toThrow();
  expect(() => validateDevFnConfig(config({ domain: "example.test", host: "app.example" }))).toThrow(/one DNS label/);
  expect(() => validateDevFnConfig(config({ domain: "example.localhost" }))).toThrow(/concrete registered domain/);
  // A domain name longer than DNS allows fails like any other invalid name.
  const oversized = `${Array.from({ length: 4 }, () => "a".repeat(63)).join(".")}.test`;
  expect(() => validateDevFnConfig(config({ domain: oversized }))).toThrow(/concrete registered domain/);
});

it("rejects ambiguous URL paths and deceptive localhost policy suffixes", () => {
  expect(() => validateDevFnConfig(config({ path: "/api%2fadmin" }))).toThrow(/unambiguous/);
  expect(() => validateDevFnConfig(config({ path: "/api", match: "exact", stripPrefix: true }))).toThrow(/prefix/);
  expect(() => validateDevFnPolicy({ version: 1, hostnameSuffix: ".localhost.evil.test" })).toThrow(/localhost/);
  expect(validateDevFnPolicy({ version: 1, hostnameSuffix: ".Corp.localhost" }).hostnameSuffix).toBe(".Corp.localhost");
  expect(validateDevFnPolicy({ version: 1, hostnameSuffix: ".LOCALHOST" }).hostnameSuffix).toBe(".LOCALHOST");
  expect(() => validateDevFnPolicy({ version: 1, hostnameSuffix: ".Corp.localhost.evil.test" })).toThrow(/localhost/);
  // The longest suffix still fits the shortest generated hostname.
  const suffix = (length: number) => `.${"a".repeat(length - 11)}.localhost`;
  expect(validateDevFnPolicy({ version: 1, hostnameSuffix: suffix(60) }).hostnameSuffix).toHaveLength(60);
  const longest = `.${Array.from({ length: 3 }, () => "a".repeat(63)).join(".")}.${"b".repeat(26)}.localhost`;
  expect(longest).toHaveLength(229);
  expect(validateDevFnPolicy({ version: 1, hostnameSuffix: longest }).hostnameSuffix).toBe(longest);
  expect(() => validateDevFnPolicy({ version: 1, hostnameSuffix: `.${Array.from({ length: 3 }, () => "a".repeat(63)).join(".")}.${"b".repeat(27)}.localhost` })).toThrow(/hostnameSuffix/);
});

it("validates inferred registered-domain labels while loading the manifest", () => {
  const withKey = (key: string, host?: string) => ({ version: 1, project: { id: "fixture" }, ports: { app: {} },
    profiles: { default: { proxy: true } }, hostnames: { [key]: { target: "app", domain: "dev.example.test", ...(host ? { host } : {}) } } });
  expect(() => validateDevFnConfig(withKey("a".repeat(40)))).not.toThrow();
  expect(() => validateDevFnConfig(withKey("a".repeat(41)))).toThrow(/host label/);
  expect(() => validateDevFnConfig(withKey("api_v2"))).toThrow(expect.objectContaining({ path: "hostnames.api_v2" }));
  expect(() => validateDevFnConfig(withKey("api_v2", "api"))).not.toThrow();
});
