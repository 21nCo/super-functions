import { describe, expect, it, vi } from "vitest";
import { Chain } from "../src/orchestration/chain.js";
import { ValidationError } from "../src/core/errors.js";

describe("router registration boundary", () => {
  it.each(["toString", "constructor", "__proto__", "missing"])("rejects unregistered key %s", async (key) => {
    const route = Chain.router({ routes: {}, router: () => key });
    await expect(route.run("input")).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not execute an inherited route", async () => {
    const inherited = vi.fn(() => "unexpected");
    const route = Chain.router({ routes: Object.create({ inherited }), router: () => "inherited" });
    await expect(route.run("input")).rejects.toBeInstanceOf(ValidationError);
    expect(inherited).not.toHaveBeenCalled();
  });

  it("allows an explicitly registered Object prototype name", async () => {
    const route = Chain.router<string, string>({ routes: { toString: (value) => value.toUpperCase() }, router: () => "toString" });
    await expect(route.run("input")).resolves.toBe("INPUT");
  });
});
