import { describe, expect, it } from "vitest";
import { renderCaddyfile } from "../src/index.js";

describe("Caddy route rendering", () => {
  it("renders explicit routes without a catch-all", () => {
    const output = renderCaddyfile([{ id: "a", instanceId: "i", hostname: "app-i.localhost", targetHost: "127.0.0.1", targetPort: 4100, tls: "off", updatedAt: "now" }]);
    expect(output).toContain("http://app-i.localhost {\n  reverse_proxy 127.0.0.1:4100\n}");
    expect(output).not.toContain(":80 {");
    expect(output).not.toContain("* {");
    expect(output).not.toContain(":443 {");
  });

  it("brackets IPv6 loopback targets and rejects directive injection", () => {
    const output = renderCaddyfile([{ id: "a", instanceId: "i", hostname: "app-i.localhost", targetHost: "::1", targetPort: 4100, tls: "off", updatedAt: "now" }]);
    expect(output).toContain("reverse_proxy [::1]:4100");
    expect(() => renderCaddyfile([{ id: "a", instanceId: "i", hostname: "app.localhost\n:80", targetHost: "127.0.0.1", targetPort: 4100, tls: "off", updatedAt: "now" }])).toThrow(/concrete/);
  });
});
