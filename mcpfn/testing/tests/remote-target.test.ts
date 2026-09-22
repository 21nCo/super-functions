import {
  McpFnTargetSuiteArtifactCleanupError,
  McpFnTargetSuiteCleanupError,
} from "../src/suite.js";
import { startAuthenticatedServer, listen, closeServer } from "../../test-support/authenticated-server.js";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpFnClient, customTarget, type McpFnDiagnosticEvent } from "@mcpfn/client";

import {
  authenticatedHttpTarget,
  McpFnTestClientCleanupError,
  McpFnTestClient,
  createMcpFnTargetSuiteJUnit,
  runMcpFnTargetSuite,
  type McpFnRemoteCredentialProvider,
} from "../src/index.js";

describe("authenticated remote MCP targets", () => {
  const closeCallbacks: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.allSettled(closeCallbacks.splice(0).map((close) => close()));
  });

  it("retains credentials through the final successful close diagnostic", async () => {
    // Deliberately collide with the authored diagnostic outcome so the final
    // lifecycle event must become a marked redaction omission.
    const secret = "succeeded";
    const fixture = await startAuthenticatedServer(secret);
    closeCallbacks.push(fixture.close);
    const diagnostics: McpFnDiagnosticEvent[] = [];
    const client = new McpFnClient({
      target: authenticatedHttpTarget(fixture.url, {
        credential: { headers: { authorization: `Bearer ${secret}` } },
      }),
      diagnostics: event => { diagnostics.push(event); },
    });

    await client.connect();
    const omissionsBeforeClose = client.getRedactionOmissionCounts().diagnostics;
    await client.close();

    expect(client.getRedactionOmissionCounts().diagnostics)
      .toBeGreaterThan(omissionsBeforeClose);
    expect(diagnostics.some(event => client.isRedactionOmission(event)))
      .toBe(true);
    expect(JSON.stringify(diagnostics)).not.toContain('"succeeded"');
  });

  it("retains released credentials through a failed-open diagnostic", async () => {
    // Deliberately collide with the authored diagnostic outcome so the
    // failed-open event must become a marked redaction omission.
    const secret = "failed";
    const diagnostics: McpFnDiagnosticEvent[] = [];
    const client = new McpFnClient({
      target: authenticatedHttpTarget("http://127.0.0.1:1/mcp", {
        credential: { headers: { authorization: `Bearer ${secret}` } },
      }),
      diagnostics: event => { diagnostics.push(event); },
    });
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    try {
      await expect(client.connect()).rejects.toThrow();
    } finally {
      fetch.mockRestore();
      await client.close();
    }

    expect(client.getRedactionOmissionCounts().diagnostics).toBeGreaterThan(0);
    expect(JSON.stringify(diagnostics)).not.toContain('"failed"');
  });

  it("retains failed connection cleanup ownership for caller retries", async () => {
    const connectionFailure = new Error("connection failed");
    const cleanup = vi.fn(async () => {
      if (cleanup.mock.calls.length < 3) throw new Error("temporary cleanup failure");
    });
    const target = customTarget({
      kind: "custom",
      open: async () => { throw connectionFailure; },
      cleanup,
    });
    const failure = await McpFnTestClient.connectTarget(target).then(
      () => { throw new Error("Expected connection failure"); },
      error => error as McpFnTestClientCleanupError,
    );
    expect(failure).toBeInstanceOf(McpFnTestClientCleanupError);
    expect(failure.cause).toBe(connectionFailure);
    expect(cleanup).toHaveBeenCalledTimes(2);
    await expect(failure.retryCleanup()).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledTimes(3);
  });


  it("rejects plaintext remote credentials and removes descriptor query values", () => {
    const credential = { headers: { authorization: "Bearer secret" } };
    expect(() => authenticatedHttpTarget("http://example.com/mcp", { credential })).toThrow(/HTTPS/);
    expect(authenticatedHttpTarget("https://example.com/mcp?credential=secret", { credential }).describe().url)
      .toBe("https://example.com/mcp");
  });

  it("checks visible tools without a manifest and reports cleanup failures", async () => {
    const fixture = await startAuthenticatedServer("cleanup-secret");
    closeCallbacks.push(fixture.close);
    const report = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget(fixture.url, { credential: {
        acquire: () => ({ headers: { authorization: "Bearer cleanup-secret" } }),
        revoke: () => { throw new Error("revoke failed: cleanup-secret"); },
      } }), expectedToolNames: ["missing-tool"],
    }).then(() => { throw new Error("Expected cleanup rejection"); }, error => {
      expect(error).toBeInstanceOf(McpFnTargetSuiteCleanupError);
      return (error as McpFnTargetSuiteCleanupError).report;
    });
    expect(report.ok).toBe(false);
    expect(report.failure?.message).toContain("Tool inventory mismatch");
    expect(report.incompleteReason).toContain("Target cleanup failed");
    expect(JSON.stringify(report)).not.toContain("cleanup-secret");
  });
  it("scrubs reflected opaque credentials from JSON and JUnit", async () => {
    const secret = "opaque-7Qx9";
    const fixture = await startAuthenticatedServer(secret, true);
    closeCallbacks.push(fixture.close);
    const report = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget(fixture.url, { credential: { headers: { authorization: `Bearer ${secret}` } } }),
      scenarios: [{ name: "reflection", tool: "identity", expect: { structuredContent: { echo: "different" } } }],
    });
    expect(report.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(createMcpFnTargetSuiteJUnit(report)).not.toContain(secret);
  });

  it("uses URL plus a real auth-provider adapter without server or registry types in the consumer", async () => {
    const fixture = await startAuthenticatedServer("remote-secret");
    closeCallbacks.push(fixture.close);
    const lifecycle: string[] = [];
    const credential = lifecycleProvider("remote-secret", lifecycle);

    const report = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget(fixture.url, { credential }),
      scenarios: [{
        name: "call authenticated identity",
        tool: "identity",
        expect: { structuredContent: { authenticated: true } },
      }],
    });

    expect(report).toMatchObject({
      ok: true,
      target: {
        kind: "authenticated-streamable-http",
        authenticated: true,
      },
      runtime: {
        reportSchemaVersion: "1.0.0",
        packages: { testing: expect.stringMatching(/^\d+\.\d+\.\d+/) },
      },
      passed: 1,
    });
    expect(JSON.stringify(report)).not.toContain("remote-secret");
    expect(lifecycle).toEqual(["acquire", "revoke", "dispose"]);
  });

  it("returns a redacted layer-classified report and releases credentials on initialization failure", async () => {
    const fixture = await startAuthenticatedServer("expected-secret");
    closeCallbacks.push(fixture.close);
    const lifecycle: string[] = [];

    const report = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget(fixture.url, {
        credential: lifecycleProvider("wrong-secret", lifecycle),
      }),
      scenarios: [{ name: "never reached", kind: "initialize" }],
    });

    expect(report).toMatchObject({
      ok: false,
      status: "incomplete",
      failure: {
        code: expect.any(String),
        phase: expect.any(String),
        layer: "resource-server",
      },
    });
    expect(report.results).toEqual([]);
    expect(JSON.stringify(report)).not.toContain("wrong-secret");
    expect(lifecycle).toEqual(["acquire", "revoke", "dispose"]);
  });

  it("memoizes concurrent closes so credentials are revoked and disposed exactly once", async () => {
    const fixture = await startAuthenticatedServer("close-secret");
    closeCallbacks.push(fixture.close);
    const lifecycle: string[] = [];
    const client = await McpFnTestClient.connectTarget(
      authenticatedHttpTarget(fixture.url, {
        credential: lifecycleProvider("close-secret", lifecycle),
      }),
    );

    await Promise.all([client.close(), client.close(), client.close()]);
    expect(lifecycle).toEqual(["acquire", "revoke", "dispose"]);
  });

  it("rejects credentialed redirects without forwarding the credential", async () => {
    let destinationRequests = 0;
    const destination = createServer((_request, response) => {
      destinationRequests += 1;
      response.writeHead(200).end();
    });
    await listen(destination);
    closeCallbacks.push(() => closeServer(destination));
    const destinationAddress = destination.address() as AddressInfo;
    const redirect = createServer((_request, response) => {
      response.writeHead(307, {
        location: `http://127.0.0.1:${destinationAddress.port}/mcp`,
      }).end();
    });
    await listen(redirect);
    closeCallbacks.push(() => closeServer(redirect));
    const redirectAddress = redirect.address() as AddressInfo;

    const report = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget(
        `http://127.0.0.1:${redirectAddress.port}/mcp`,
        { credential: { headers: { authorization: "Bearer redirect-secret" } } },
      ),
    });

    expect(report.ok).toBe(false);
    expect(destinationRequests).toBe(0);
    expect(JSON.stringify(report)).not.toContain("redirect-secret");
  });

  it("bounds and validates credential header input before transport initialization", async () => {
    const acquire = vi.fn(() => ({ headers: {} }));
    const revoke = vi.fn();
    const dispose = vi.fn();
    const report = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget("http://127.0.0.1:1/mcp", {
        credential: { acquire, revoke, dispose },
      }),
    });
    expect(report.failure?.message).toContain("at least one credential header");
    expect(acquire).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

function lifecycleProvider(
  token: string,
  lifecycle: string[],
): McpFnRemoteCredentialProvider {
  return {
    acquire: async () => {
      lifecycle.push("acquire");
      return { kind: "oauth", headers: { authorization: `Bearer ${token}` } };
    },
    revoke: async () => { lifecycle.push("revoke"); },
    dispose: async () => { lifecycle.push("dispose"); },
  };
}

it.each(["", "   "])("rejects blank credential headers without corrupting reports (%j)", async (value) => {
  const report = await runMcpFnTargetSuite({ target: authenticatedHttpTarget("http://127.0.0.1:1/mcp", { credential: { headers: { "x-api-key": value } } }) });
  expect(report.ok).toBe(false);
  expect(report.failure?.message).toContain("must not be blank");
  expect(JSON.stringify(report).length).toBeLessThan(10000);
});

it("redacts invalid-header cleanup errors and credential-shaped fields", async () => {
  const { redactTargetCredentials } = await import("../src/remote-target.js");
  const target = authenticatedHttpTarget("http://127.0.0.1:1/mcp", { credential: {
    acquire: () => ({ headers: { host: "opaque-invalid-credential" } }),
    revoke: () => { throw new Error("opaque-invalid-credential"); },
  } });
  const report = await runMcpFnTargetSuite({ target }).then(() => { throw new Error("Expected cleanup rejection"); }, error => {
      expect(error).toBeInstanceOf(McpFnTargetSuiteCleanupError);
      return (error as McpFnTargetSuiteCleanupError).report;
    });
  expect(report.ok).toBe(false);
  expect(JSON.stringify(report)).not.toContain("opaque-invalid-credential");
  expect(JSON.stringify(redactTargetCredentials(target, { access_token: "unrelated-secret" }))).not.toContain("unrelated-secret");
});

it("retains released values for a report scope and forgets them when that scope ends", async () => {
  const { beginTargetCredentialRedaction, redactTargetCredentials } = await import("../src/remote-target.js");
  const fixture = await startAuthenticatedServer("rotated-opaque-value");
  const target = authenticatedHttpTarget(fixture.url, { credential: { headers: { authorization: "Bearer rotated-opaque-value" } } });
  const finish = beginTargetCredentialRedaction(target);
  try {
    const client = await McpFnTestClient.connectTarget(target);
    await client.close();
    expect(redactTargetCredentials(target, "rotated-opaque-value")).toBe("[REDACTED]");
    finish();
    expect(redactTargetCredentials(target, "rotated-opaque-value")).toBe("rotated-opaque-value");
  } finally { finish(); await fixture.close(); }
});

it("preserves report collections and fixed keys while scrubbing payload keys", async () => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const secret = "opaque-payload-secret";
  const report = { target: { kind: "http" }, results: Array.from({ length: 501 }, (_, index) => ({ index, structuredContent: { [secret]: secret } })), count: 501 };
  const result = redactRemoteCredential({ headers: { "x-api-key": secret } }, report, { preserveKeys: true });
  expect(result.target).toEqual({ kind: "http" });
  expect(result.results).toHaveLength(501);
  expect(result.count).toBe(501);
  expect(result.results[0].structuredContent).toEqual({ "[REDACTED]": "[REDACTED]" });
});
it("rejects non-string headers and releases the acquired lease", async () => {
  const dispose = vi.fn();
  const target = authenticatedHttpTarget("http://127.0.0.1:1/mcp", { credential: { acquire: () => ({ headers: { "x-api-key": 123456 } as any }), dispose } });
  const report = await runMcpFnTargetSuite({ target });
  expect(report.ok).toBe(false);
  expect(dispose).toHaveBeenCalledOnce();
  expect(report.failure?.message).toContain("Authenticated target could not be opened");
});
it("retries revocation before disposing provider state", async () => {
  const { acquireRemoteCredential } = await import("../src/remote-target.js");
  const revoke = vi.fn().mockRejectedValueOnce(new Error("retry")).mockResolvedValue(undefined);
  const dispose = vi.fn();
  const lease = await acquireRemoteCredential({ acquire: () => ({ headers: { "x-api-key": "secret" } }), revoke, dispose }, { url: "https://test/mcp", requestId: "test" });
  await expect(lease.release()).rejects.toThrow(/cleanup failed/);
  expect(dispose).not.toHaveBeenCalled();
  await expect(lease.release()).resolves.toBeUndefined();
  await lease.release();
  expect(revoke).toHaveBeenCalledTimes(2);
  expect(dispose).toHaveBeenCalledOnce();
});
it("handles long authorization whitespace without backtracking", async () => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  expect(() => redactRemoteCredential({ headers: { authorization: `Bearer${" ".repeat(100000)}opaque` } }, "opaque")).toThrow(/value-size limit/);
});

it("retries authenticated handle revocation after a strict close fails", async () => {
  const fixture = await startAuthenticatedServer("retry-secret");
  const revoke = vi.fn().mockRejectedValueOnce(new Error("retry-secret")).mockResolvedValue(undefined);
  const dispose = vi.fn();
  const target = authenticatedHttpTarget(fixture.url, { credential: { acquire: () => ({ headers: { authorization: "Bearer retry-secret" } }), revoke, dispose } });
  try {
    const handle = await target.open({ requestId: "retry", diagnostic: async () => {} } as any);
    await expect(handle.close!()).rejects.toThrow(/cleanup failed/);
    await expect(handle.close!()).resolves.toBeUndefined();
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledOnce();
  } finally { await fixture.close(); }
});

it("redacts dynamic inspector keys without corrupting result statuses", async () => {
  const { redactRemoteCredential, McpFnRedactionLimitError } = await import("../src/remote-target.js");
  const secret = "opaque-status-secret";
  const credential = { headers: { "x-api-key": secret } };
  const report = { kind: "mcpfn.target-suite-report", ok: true, results: [{ status: "passed", name: secret }], timeline: [{ details: { [secret]: secret } }] };
  const redacted = redactRemoteCredential(credential, report, { preserveKeys: true });
  expect(createMcpFnTargetSuiteJUnit({ ...redacted, target: { kind: "custom" }, runtime: { node: process.version }, status: "complete", total: 1, passed: 1, failed: 0, incomplete: 0, droppedResults: 0, droppedObservedEvents: 0, droppedTimelineEvents: 0 } as any)).not.toContain("<failure");
  expect(redacted.results[0]).toEqual({ status: "passed", name: "[REDACTED]" });
  const snapshot = { kind: "mcpfn.inspector-snapshot", timeline: [{ event: { [secret]: { status: secret } } }] };
  expect(JSON.stringify(redactRemoteCredential(credential, snapshot, { preserveKeys: true }))).not.toContain(secret);
  let deep: any = {}; for (let i = 0; i < 40; i++) deep = { child: deep };
  expect(() => redactRemoteCredential(credential, deep)).toThrow(McpFnRedactionLimitError);
  expect(() => redactRemoteCredential(credential, new Array(1_000_000))).toThrow(McpFnRedactionLimitError);
});

it.each(["pass", "complete"])("rejects credential %s when it collides with authored artifact structure", async secret => {
  const { redactRemoteCredential, McpFnRedactionLimitError } = await import("../src/remote-target.js");
  const report = {
    kind: "mcpfn.target-suite-report",
    status: "complete",
    ok: true,
    passed: 1,
    results: [{ status: "passed" }],
  };
  expect(() => redactRemoteCredential(
    { headers: { "x-api-key": secret } },
    report,
    { preserveKeys: true },
  )).toThrow(McpFnRedactionLimitError);
});

it("treats enumerable Error __proto__ fields as payload without mutating prototypes", async () => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const secret = "prototype-owned-secret";
  const error = new Error("failed");
  Object.defineProperty(error, "__proto__", {
    enumerable: true,
    value: { private: secret },
  });

  const redacted = redactRemoteCredential(
    { headers: { "x-api-key": secret } },
    error,
  ) as unknown as Record<string, unknown>;

  expect(Object.prototype.hasOwnProperty.call(redacted, "__proto__")).toBe(true);
  expect(Object.getPrototypeOf(redacted)).toBe(Object.prototype);
  expect(JSON.stringify(redacted)).not.toContain(secret);
});

it("retains failed pre-handle releases for a cleanup retry", async () => {
  const revoke = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue(undefined);
  const target = authenticatedHttpTarget("http://127.0.0.1:1/mcp", { credential: {
    acquire: () => ({ headers: undefined } as any), revoke,
  } });
  await expect(target.open({ requestId: "invalid", diagnostic: async () => {} })).rejects.toThrow(/cleanup failed/);
  await target.cleanup!();
  expect(revoke).toHaveBeenCalledTimes(2);
});
it("releases malformed credentials even when inspection fails", async () => {
  const revoke = vi.fn();
  const target = authenticatedHttpTarget("http://127.0.0.1:1/mcp", { credential: {
    acquire: () => ({ headers: undefined } as any), revoke,
  } });
  await expect(target.open({ requestId: "invalid", diagnostic: async () => {} })).rejects.toThrow();
  expect(revoke).toHaveBeenCalledOnce();
});

it("scrubs opaque credentials before generic redaction can truncate their suffix", async () => {
  const {redactRemoteCredential} = await import("../src/remote-target.js");
  const token = "opaque-credential-unique-tail";
  const input = "data=x " + "a".repeat(262144 - 7 - 8) + token;
  // Inputs beyond the explicit budget fail closed before any output is emitted.
  expect(() => redactRemoteCredential({headers: {"x-api-key": token}}, input)).toThrow(/traversal budget/);
});
it("scrubs token components of custom authorization schemes", async () => {
  const {redactRemoteCredential} = await import("../src/remote-target.js");
  expect(redactRemoteCredential({headers: {authorization: "Token opaque-123"}}, {echo: "opaque-123"})).toEqual({echo: "[REDACTED]"});
});

it.each(["opaque-token==", "opaque._~+/-=="])(
  "preserves and scrubs padded custom-scheme token68 credentials: %s",
  async token => {
    const { redactRemoteCredential } = await import("../src/remote-target.js");
    expect(redactRemoteCredential(
      { headers: { authorization: `Token ${token}` } },
      { echo: token },
    )).toEqual({ echo: "[REDACTED]" });
  },
);

it("scrubs independently reflected structured authorization parameters", async () => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const credential = {
    headers: {
      authorization: 'Digest username="fixture-user", response="opaque\\"digest", nonce=opaque-nonce',
    },
  };
  expect(redactRemoteCredential(credential, {
    username: "fixture-user",
    response: 'opaque"digest',
    rawResponse: 'opaque\\"digest',
    quotedResponse: '"opaque\\"digest"',
    nonce: "opaque-nonce",
  })).toEqual({
    username: "[REDACTED]",
    response: "[REDACTED]",
    rawResponse: "[REDACTED]",
    quotedResponse: "[REDACTED]",
    nonce: "[REDACTED]",
  });
});

it.each([
  'Digest username="unterminated',
  "Signature keyId=client,missing",
  "Signature keyId=client,",
])("rejects malformed structured authorization credentials and releases their lease", async authorization => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  expect(() => redactRemoteCredential({ headers: { authorization } }, "report"))
    .toThrow(/Authorization credential/);
  const revoke = vi.fn();
  const target = authenticatedHttpTarget("http://127.0.0.1:1/mcp", { credential: {
    acquire: () => ({ headers: { authorization } }), revoke,
  } });
  await expect(target.open({ requestId: "invalid", diagnostic: async () => {} }))
    .rejects.toThrow(/Authenticated target could not be opened/);
  expect(revoke).toHaveBeenCalledOnce();
});


it("retains successful-open leases until revocation succeeds", async () => {
  const revoke = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue(undefined);
  const target = authenticatedHttpTarget('http://127.0.0.1:1/mcp', { credential: { acquire: () => ({ headers: { 'x-api-key': 'opaque-key' } }), revoke } });
  const handle = await target.open({ requestId: 'lease', diagnostic: async () => {} });
  await expect(handle.close!()).rejects.toThrow(/cleanup/);
  await target.cleanup!();
  expect(revoke).toHaveBeenCalledTimes(2);
});

it("rejects credentials that collide with fixed report values", async () => {
  const { redactRemoteCredential, McpFnRedactionLimitError } = await import('../src/remote-target.js');
  for (const secret of ['none', 'http', '0.0.5']) {
    const report = { kind: 'mcpfn.target-suite-report', target: { kind: 'authenticated-streamable-http' }, runtime: { packages: { testing: '0.0.5' } }, results: [{ sideEffect: 'none', name: secret }] };
    expect(() => redactRemoteCredential(
      { headers: { 'x-api-key': secret } },
      report,
      { preserveKeys: true },
    )).toThrow(McpFnRedactionLimitError);
  }
  const credential = { headers: { 'x-api-key': 'a' } };
  expect(String(redactRemoteCredential(credential, 'a'.repeat(1000)))).toHaveLength(1000);
  const result: any = redactRemoteCredential({ headers: { 'x-api-key': 'opaque-secret' } }, new Error('failed opaque-secret'));
  expect(result.message).toContain('failed');
  expect(result.message).not.toContain('opaque-secret');
});

it("rejects oversized raw header collections before reading their values", async () => {
  const { validateRemoteCredentialHeaders, redactRemoteCredential } = await import("../src/remote-target.js");
  const headers = new Array(100000) as [string, string][];
  Object.defineProperty(headers, 0, { get() { throw new Error("must not read oversized input"); } });
  expect(() => validateRemoteCredentialHeaders(headers)).toThrow(/header limit/);
  expect(() => redactRemoteCredential({ headers }, "report")).toThrow(/header limit/);
});

it("enforces encoded byte limits while collecting redaction secrets", async () => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  expect(() => redactRemoteCredential({ headers: { "x-key": "€".repeat(3000) } }, "report")).toThrow(/value-size limit/);
});

it("does not release another live handle during target cleanup", async () => {
  const revoke = vi.fn();
  const target = authenticatedHttpTarget('http://127.0.0.1:1/mcp', { credential: { acquire: () => ({ headers: { 'x-api-key': 'shared-target-key' } }), revoke } });
  const first = await target.open({ requestId: 'first', diagnostic: async () => {} });
  const second = await target.open({ requestId: 'second', diagnostic: async () => {} });
  await first.close!(); await target.cleanup!();
  expect(revoke).toHaveBeenCalledTimes(1);
  await second.close!(); expect(revoke).toHaveBeenCalledTimes(2);
});


it("revokes with an independent signal after acquisition is cancelled, including retries", async () => {
  const { acquireRemoteCredential } = await import("../src/remote-target.js");
  const acquisition = new AbortController();
  const signals: AbortSignal[] = [];
  const revoke = vi.fn(async (_credential, context) => {
    signals.push(context.signal);
    context.signal.throwIfAborted();
    if (signals.length === 1) throw new Error("retryable network failure");
  });
  const dispose = vi.fn(async (_credential, context) => context.signal.throwIfAborted());
  const lease = await acquireRemoteCredential({ acquire: () => ({ headers: {} }), revoke, dispose },
    { url: "https://test/mcp", requestId: "cancelled", signal: acquisition.signal });
  acquisition.abort();
  await expect(lease.release()).rejects.toThrow("cleanup failed");
  await expect(lease.release()).resolves.toBeUndefined();
  expect(revoke).toHaveBeenCalledTimes(2);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(signals.every(signal => !signal.aborted && signal !== acquisition.signal)).toBe(true);
  expect(signals[0]).not.toBe(signals[1]);
});

it.each(["1.0.0", "0.1.16"])("rejects credentials that equal structural report version %s", async secret => {
  const { redactRemoteCredential, McpFnRedactionLimitError } = await import("../src/remote-target.js");
  expect(() => redactRemoteCredential({ headers: { "x-api-key": secret } }, {
    kind: "mcpfn.official-conformance-report", suiteVersion: "0.1.16",
    runtime: { reportSchemaVersion: "1.0.0" }, stdout: `echo ${secret}`,
  }, { preserveKeys: true })).toThrow(McpFnRedactionLimitError);
});

it.each(["Basic", "bAsIc"])("redacts decoded %s username and password, including colons in passwords", async (scheme) => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const username = "opaque-basic-user";
  const password = "opaque-basic-password:tail";
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  const credential = { headers: { authorization: `${scheme} ${token}` } };
  const result = redactRemoteCredential(credential, { username, password, pair: `${username}:${password}`, token });
  expect(Object.values(result)).toEqual(Array(4).fill("[REDACTED]"));
});

it("redacts scenario credentials before truncation can leave a secret prefix", async () => {
  const secret = "private-prefix-" + "z".repeat(200);
  const fixture = await startAuthenticatedServer(secret);
  try {
    const report = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget(fixture.url, { credential: { headers: { authorization: `Bearer ${secret}` } } }),
      scenarios: [{ name: "incomplete", tool: "identity", status: "incomplete", incompleteReason: "x".repeat(40) + secret }],
      scenarioRun: { maxErrorBytes: 64 },
    });
    expect(report.results[0]?.status).toBe("incomplete");
    expect(report.results[0]?.error).toContain("[REDACTED]");
    expect(JSON.stringify(report)).not.toContain("private-");
    expect(createMcpFnTargetSuiteJUnit(report)).not.toContain("private-");
  } finally { await fixture.close(); }
});

it("redacts suite-level failures before truncating registered credentials", async () => {
  const secret = "private-prefix-" + "z".repeat(200);
  const fixture = await startAuthenticatedServer(secret);
  try {
    const report = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget(fixture.url, { credential: { headers: { authorization: `Bearer ${secret}` } } }),
      expectedToolNames: ["x".repeat(1980) + secret],
    });
    expect(report.status).toBe("incomplete");
    expect(report.failure?.message).toContain("[REDACTED]");
    expect(JSON.stringify(report)).not.toContain("private-prefix");
    expect(createMcpFnTargetSuiteJUnit(report)).not.toContain("private-prefix");
  } finally { await fixture.close(); }
});
it("retries disposal without repeating a successful revocation", async () => {
  const { acquireRemoteCredential } = await import("../src/remote-target.js");
  const revoke = vi.fn();
  const dispose = vi.fn().mockRejectedValueOnce(new Error("retry")).mockResolvedValue(undefined);
  const lease = await acquireRemoteCredential({ acquire: () => ({ headers: {} }), revoke, dispose }, { url: "https://test/mcp", requestId: "test" });
  await expect(lease.release()).rejects.toThrow(/cleanup failed/);
  await lease.release();
  expect(revoke).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledTimes(2);
});

it("preserves a safe cleanup phase without exposing provider failures", async () => {
  const { acquireRemoteCredential } = await import("../src/remote-target.js");
  const secret = "raw-provider-secret";
  const lease = await acquireRemoteCredential({
    acquire: () => ({ kind: "oauth", headers: { authorization: "Bearer safe-token" } }),
    revoke: () => { throw new Error(`provider rejected ${secret}`); },
  }, { url: "https://test/mcp", requestId: "test" });
  const failure = await lease.release().catch(error => error as Error & { phase?: string });
  expect(failure).toMatchObject({
    message: "Target credential cleanup failed",
    phase: "token-revocation",
  });
  expect(failure.cause).toBeUndefined();
  expect(String(failure)).not.toContain(secret);
});

it("preserves token-revocation through pre-handle target cleanup retries", async () => {
  let cleanupMaySucceed = false;
  const secret = "pre-handle-provider-secret";
  const revoke = vi.fn(async () => {
    if (!cleanupMaySucceed) throw new Error(`provider rejected ${secret}`);
  });
  const target = authenticatedHttpTarget("http://127.0.0.1:1/mcp", {
    credential: {
      acquire: () => ({
        kind: "oauth",
        headers: { authorization: "Bearer invalid\nheader" },
      }),
      revoke,
    },
  });
  const failure = await runMcpFnTargetSuite({ target }).catch(error => error as McpFnTargetSuiteCleanupError);
  expect(failure).toBeInstanceOf(McpFnTargetSuiteCleanupError);
  expect(failure.report.failure).toMatchObject({
    phase: "token-revocation",
    layer: "authorization-server",
  });
  expect(JSON.stringify(failure.report)).not.toContain(secret);
  cleanupMaySucceed = true;
  await failure.retryCleanup();
  expect(revoke.mock.calls.length).toBeGreaterThanOrEqual(3);
});

it.each(['oversized', 'throwing-proxy'])("returns a safe incomplete report when error redaction encounters %s", async mode => {
  const secret = 'opaque-cause-secret';
  const fixture = await startAuthenticatedServer(secret);
  const cause = mode === 'oversized' ? {message: secret.repeat(30000)} : new Proxy({}, {ownKeys() { throw new Error(secret); }});
  try {
    const report = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget(fixture.url, {credential:{headers:{'x-api-key':secret, authorization:`Bearer ${secret}`}}}),
      expectedToolNames: { [Symbol.iterator]() { throw new Error('inventory failure', {cause}); } } as any,
    });
    expect(report.status).toBe('incomplete');
    expect(report.failure?.code).toBe('MCPFN_REDACTION_FAILED');
    expect(JSON.stringify(report)).not.toContain(secret);
  } finally { await fixture.close(); }
});
it('accepts the entire IPv4 literal loopback range for conformance upstreams', async () => {
  const {createAuthenticatedConformanceProxy} = await import('../src/conformance.js');
  for (const host of ['127.0.0.2','127.255.255.254']) {
    const proxy = await createAuthenticatedConformanceProxy({url:`http://${host}:1/mcp`, headers:{'x-api-key':'test'}});
    await proxy.close();
  }
  await expect(createAuthenticatedConformanceProxy({url:'http://128.0.0.1/mcp',headers:{'x-api-key':'test'}})).rejects.toThrow(/loopback/);
});

it("drains a retained credential lease when initialization never returns a client", async () => {
  const fixture = await startAuthenticatedServer("expected");
  const revoke = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue(undefined);
  const dispose = vi.fn();
  try {
    const report = await runMcpFnTargetSuite({ target: authenticatedHttpTarget(fixture.url, {
      credential: { acquire: () => ({ headers: { authorization: "Bearer wrong" } }), revoke, dispose },
    }) });
    expect(report.ok).toBe(false);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledOnce();
  } finally { await fixture.close(); }
});

it.each(["throw", "proxy", "long-secret"])("captures a safe descriptor before its %s post-cleanup behavior", async mode => {
  const secret = "opaque-descriptor-" + "z".repeat(5000);
  const fixture = await startAuthenticatedServer(secret);
  const revoke = vi.fn();
  const target = authenticatedHttpTarget(fixture.url, {
    credential: { acquire: () => ({ headers: { authorization: `Bearer ${secret}` } }), revoke },
  });
  const original = target.describe;
  target.describe = () => {
    if (revoke.mock.calls.length === 0) return original(); // Exercise the final reporting boundary after release.
    if (mode === "throw") throw new Error(secret);
    if (mode === "proxy") return new Proxy({}, { ownKeys() { throw new Error(secret); } }) as any;
    return { kind: "custom", label: secret };
  };
  try {
    const report = await runMcpFnTargetSuite({ target });
    expect(revoke).toHaveBeenCalledOnce();
    expect(JSON.stringify(report)).not.toContain("opaque-descriptor-");
    expect(report).toMatchObject({ ok: true, status: "complete" });
  } finally { await fixture.close(); }
});


it("does not expose provider acquisition errors before credentials are available for redaction", async () => {
  const { runAuthenticatedOfficialConformance } = await import("../src/conformance.js");
  const secret = "provider-internal-opaque-secret";
  const credential = { acquire: () => { throw new Error(secret); }, revoke: vi.fn(), dispose: vi.fn() };
  const url = "http://127.0.0.1:1/mcp";
  const report = await runMcpFnTargetSuite({ target: authenticatedHttpTarget(url, { credential }) });
  expect(report.ok).toBe(false);
  expect(report.failure?.message).toContain("credential acquisition failed");
  expect(JSON.stringify(report)).not.toContain(secret);
  await expect(runAuthenticatedOfficialConformance({ url, credential })).rejects.toThrow("Target credential acquisition failed");
  expect(credential.revoke).not.toHaveBeenCalled();
  expect(credential.dispose).not.toHaveBeenCalled();
});

it("marks the report incomplete when a credential matches the structural target kind", async () => {
  const fixture = await startAuthenticatedServer("http");
  try {
    const report = await runMcpFnTargetSuite({ target: authenticatedHttpTarget(fixture.url, {
      credential: { headers: { authorization: "Bearer http" } },
    }) });
    expect(report.ok).toBe(false);
    expect(report.status).toBe("incomplete");
    expect(report.incompleteReason).toContain("Credential redaction");
  } finally { await fixture.close(); }
});

it("rejects safely when a credential matches a required report key", async () => {
  const fixture = await startAuthenticatedServer("timeline");
  try {
    const failure = await runMcpFnTargetSuite({ target: authenticatedHttpTarget(fixture.url, {
      credential: { headers: { authorization: "Bearer timeline" } },
    }) }).catch(error => error);
    expect(failure).toMatchObject({
      name: "McpFnClientError",
      code: "MCPFN_OPERATION_FAILED",
      message: "Target report cannot be serialized because a credential conflicts with required artifact structure",
    });
    expect(JSON.stringify(failure)).not.toContain("Bearer timeline");
  } finally { await fixture.close(); }
});


it.each(["x-api-key", "authorization"])("redacts URL and form encoded %s credentials across payload fields", async header => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const secret = "opaque/a+b=c value";
  const encoded = encodeURIComponent(secret);
  const mixed = encoded.replaceAll("%2F", "%2f").replaceAll("%3D", "%3d");
  const variants = [secret, encoded, mixed, encoded.replace(/%20/g, "+")];
  const credential = { headers: { [header]: header === "authorization" ? `Bearer ${secret}` : secret } };
  const result = redactRemoteCredential(credential, {
    message: variants.join(" | "),
    details: Object.fromEntries(variants.map((value, index) => [
      `variant-${index}-${value}`,
      new Error(value),
    ])),
    unrelated: "Keep CaseSensitive text",
  });
  const json = JSON.stringify(result);
  for (const variant of variants) expect(json).not.toContain(variant);
  expect(result.unrelated).toBe("Keep CaseSensitive text");
});

it("retains encoded redaction variants in report scopes after credential cleanup", async () => {
  const { beginTargetCredentialRedaction, redactTargetCredentials } = await import("../src/remote-target.js");
  const secret = "opaque/a+b=c";
  const fixture = await startAuthenticatedServer(secret);
  let end = () => undefined;
  try {
    const target = authenticatedHttpTarget(fixture.url, { credential: { headers: { "x-api-key": secret } } });
    end = beginTargetCredentialRedaction(target);
    const handle = await target.open({ signal: new AbortController().signal });
    await handle.close();
    await target.cleanup?.();
    expect(redactTargetCredentials(target, encodeURIComponent(secret))).not.toContain(encodeURIComponent(secret));
  } finally { end(); await fixture.close(); }
});


it("scrubs encoded cleanup errors from finalized JSON and JUnit reports", async () => {
  const secret = "opaque/a+b=c";
  const encoded = encodeURIComponent(secret);
  const fixture = await startAuthenticatedServer(secret);
  try {
    const report = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget(fixture.url, { credential: {
        acquire: () => ({ headers: { authorization: `Bearer ${secret}` } }),
        revoke: () => { throw new Error(`cleanup failed: ${encoded}`); },
      } }),
    }).then(() => { throw new Error("Expected cleanup rejection"); }, error => {
      expect(error).toBeInstanceOf(McpFnTargetSuiteCleanupError);
      return (error as McpFnTargetSuiteCleanupError).report;
    });
    expect(report.ok).toBe(false);
    expect(report.incompleteReason).toContain("Target cleanup failed");
    expect(JSON.stringify(report)).not.toContain(encoded);
    expect(createMcpFnTargetSuiteJUnit(report)).not.toContain(encoded);
  } finally { await fixture.close(); }
});


it("uses form serialization for punctuation while preserving literal percent credential case", async () => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const secret = "opaque!a'b(c)d~e f";
  const form = new URLSearchParams({ value: secret }).toString().slice("value=".length);
  expect(form).toContain("%21");
  expect(redactRemoteCredential({ headers: { "x-api-key": secret } }, form)).not.toContain(form);
  const credential = { headers: { "x-api-key": "opaque%2Fsecret" } };
  expect(redactRemoteCredential(credential, "opaque%2fsecret")).toBe("opaque%2fsecret");
  expect(redactRemoteCredential(credential, "opaque%2Fsecret")).not.toContain("opaque%2Fsecret");
  expect(redactRemoteCredential(credential, "opaque%252Fsecret")).not.toContain("opaque%252Fsecret");
});

it.each(["revoke", "dispose"])("retains suite ownership for a failed credential %s", async phase => {
  const fixture = await startAuthenticatedServer("retry-owned-secret");
  const revoke = vi.fn(async () => undefined);
  const dispose = vi.fn(async () => undefined);
  (phase === "revoke" ? revoke : dispose).mockRejectedValueOnce(new Error("retry-owned-secret"));
  try {
    const error = await runMcpFnTargetSuite({ target: authenticatedHttpTarget(fixture.url, {
      credential: { acquire: () => ({ kind: "oauth", headers: { authorization: "Bearer retry-owned-secret" } }), revoke, dispose },
    }) }).catch(error => error);
    expect(error).toBeInstanceOf(McpFnTargetSuiteCleanupError);
    expect(JSON.stringify(error.report)).not.toContain("retry-owned-secret");
    expect(error.report.failure).toMatchObject({
      phase: phase === "revoke" ? "token-revocation" : "transport-close",
      layer: phase === "revoke" ? "authorization-server" : "mcpfn-preflight",
    });
    expect(error.report.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase: phase === "revoke" ? "token-revocation" : "transport-close",
        outcome: "failed",
      }),
    ]));
    await Promise.all([error.retryCleanup(), error.retryCleanup()]);
    expect(revoke).toHaveBeenCalledTimes(phase === "revoke" ? 2 : 1);
    expect(dispose).toHaveBeenCalledTimes(phase === "dispose" ? 2 : 1);
    await error.retryCleanup();
    expect(dispose).toHaveBeenCalledTimes(phase === "dispose" ? 2 : 1);
  } finally { await fixture.close(); }
});

it("retains cleanup ownership when a credential collides with report structure", async () => {
  const secret = "timeline";
  const fixture = await startAuthenticatedServer(secret);
  const revoke = vi.fn()
    .mockRejectedValueOnce(new Error("provider cleanup failed"))
    .mockResolvedValue(undefined);
  try {
    const failure = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget(fixture.url, {
        credential: {
          acquire: () => ({
            kind: "oauth",
            headers: { authorization: `Bearer ${secret}` },
          }),
          revoke,
        },
      }),
    }).catch(error => error as McpFnTargetSuiteArtifactCleanupError);

    expect(failure).toBeInstanceOf(McpFnTargetSuiteArtifactCleanupError);
    expect(failure.message).toContain("required artifact structure");
    expect(failure.message).not.toContain(secret);
    await expect(failure.retryCleanup()).resolves.toBeUndefined();
    expect(revoke).toHaveBeenCalledTimes(2);
  } finally { await fixture.close(); }
});

it("scrubs JSON-string-escaped opaque credentials in serialized error text", async () => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const secret = 'opaque"quoted\\value';
  const serialized = JSON.stringify({ reflected: secret });
  const result = redactRemoteCredential({ headers: { "x-api-key": secret } }, serialized);
  expect(result).not.toContain(JSON.stringify(secret).slice(1, -1));
  expect(result).toContain("REDACTED");
});

it.each(["Map", "Set"])("rejects oversized %s before materializing its entries", async kind => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const collection = kind === "Map" ? new Map<number, number>() : new Set<number>();
  for (let index = 0; index <= 100_000; index++) {
    if (collection instanceof Map) collection.set(index, index);
    else collection.add(index);
  }
  Object.defineProperty(collection, "size", { get: () => 0 }); // Cannot bypass the intrinsic bound.
  expect(() => redactRemoteCredential({ headers: { "x-api-key": "secret" } }, collection)).toThrow(/traversal budget/);
});

it("bounds enumerable Error fields before copying their values", async () => {
  const { redactRemoteCredential, McpFnRedactionLimitError } = await import("../src/remote-target.js");
  const error = new Error("failure");
  for (let index = 0; index < 100_000; index += 1) {
    Object.defineProperty(error, `field-${index}`, {
      enumerable: true,
      value: index,
    });
  }
  let overflowRead = false;
  Object.defineProperty(error, "overflow", {
    enumerable: true,
    get() {
      overflowRead = true;
      return "secret";
    },
  });
  expect(() => redactRemoteCredential(
    { headers: { "x-api-key": "secret" } },
    error,
  )).toThrow(McpFnRedactionLimitError);
  expect(overflowRead).toBe(false);
});


it.each(["[REDACTED]", "REDACTED"])("keeps implicit markers from reproducing %s", async secret => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const result = redactRemoteCredential({ headers: { "x-api-key": secret } }, { echo: secret, authorization: secret });
  expect(JSON.stringify(result)).not.toContain(secret);
});


it("retains credentials until transport shutdown succeeds and serializes retries", async () => {
  const secret = "shutdown-lease-secret";
  const order: string[] = [];
  const revoke = vi.fn(async () => { order.push("revoke"); });
  const dispose = vi.fn(async () => { order.push("dispose"); });
  const target = authenticatedHttpTarget("http://127.0.0.1:1/mcp", {
    credential: { acquire: () => ({ headers: { authorization: `Bearer ${secret}` } }), revoke, dispose },
  });
  const diagnostics: Array<{ phase: string; outcome: string }> = [];
  const handle = await target.open({
    requestId: "shutdown",
    diagnostic: async event => { diagnostics.push(event); },
  } as any);
  const close = vi.spyOn(handle.transport, "close")
    .mockImplementationOnce(async () => { order.push("transport-failed"); throw new Error("transient shutdown"); })
    .mockImplementation(async () => { order.push("transport-closed"); });
  await expect(handle.close!()).rejects.toThrow();
  expect(diagnostics).toEqual([
    expect.objectContaining({ phase: "transport-close", outcome: "failed" }),
  ]);
  expect(revoke).not.toHaveBeenCalled();
  expect(dispose).not.toHaveBeenCalled();
  expect(target.redact!(secret)).not.toContain(secret);
  await target.cleanup!();
  expect(revoke).not.toHaveBeenCalled();
  await Promise.all([handle.close!(), handle.close!()]);
  expect(order).toEqual(["transport-failed", "transport-closed", "revoke", "dispose"]);
  expect(close).toHaveBeenCalledTimes(2);
  await handle.close!();
  expect(close).toHaveBeenCalledTimes(2);
});

it.each(["revoke", "dispose"])("retries only the credential stage after %s fails", async stage => {
  const revoke = vi.fn();
  const dispose = vi.fn();
  (stage === "revoke" ? revoke : dispose).mockRejectedValueOnce(new Error("transient"));
  const fixture = await startAuthenticatedServer("lease");
  const diagnostics: Array<{ phase: string; outcome: string }> = [];
  const target = authenticatedHttpTarget(fixture.url, {
    credential: { acquire: () => ({ kind: "oauth", headers: { authorization: "Bearer lease" } }), revoke, dispose },
  });
  try {
    const handle = await target.open({
      requestId: "shutdown",
      diagnostic: async event => { diagnostics.push(event); },
    } as any);
    const close = vi.spyOn(handle.transport, "close").mockResolvedValue(undefined);
    await expect(handle.close!()).rejects.toThrow();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        phase: stage === "revoke" ? "token-revocation" : "transport-close",
        outcome: "failed",
      }),
    ]);
    await Promise.all([handle.close!(), handle.close!()]);
    expect(close).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledTimes(stage === "revoke" ? 2 : 1);
    expect(dispose).toHaveBeenCalledTimes(stage === "dispose" ? 2 : 1);
  } finally { await fixture.close(); }
});


it.each(["***", "[REDACTED]", "#"])("never emits another credential as a generated mask (%s)", async mask => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const credentials = { headers: { "x-api-key": "abc", "x-secondary-key": mask } };
  const redacted = redactRemoteCredential(credentials, { value: "abc", other: mask });
  expect(JSON.stringify(redacted)).not.toContain("abc");
  expect(JSON.stringify(redacted)).not.toContain(mask);
});

it.each(["foo name", "Bearer name", "Basic name"])("keeps an opaque API key whole during extraction (%s)", async secret => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const redacted = redactRemoteCredential({ headers: { "x-api-key": secret } }, { name: "name", echoed: secret });
  expect(redacted.name).toBe("name");
  expect(JSON.stringify(redacted)).not.toContain(secret);
});

it.each(["authorization", "Authorization", "proxy-authorization"])("extracts recognized bearer credentials from %s", async header => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  expect(redactRemoteCredential({ headers: { [header]: "bEaReR tokenvalue" } }, { reflected: "tokenvalue" }).reflected).not.toBe("tokenvalue");
});

it("extracts independently reflectable Cookie credential values", async () => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const redacted = redactRemoteCredential(
    { headers: { Cookie: 'session=opaque-cookie; quoted="quoted-cookie"' } },
    { session: "opaque-cookie", quoted: "quoted-cookie" },
  );
  expect(JSON.stringify(redacted)).not.toContain("opaque-cookie");
  expect(JSON.stringify(redacted)).not.toContain("quoted-cookie");
});

it.each(["missing-pair", 'session="unterminated'])("rejects ambiguous Cookie credential syntax (%s)", async cookie => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  expect(() => redactRemoteCredential({ headers: { Cookie: cookie } }, { value: "safe" }))
    .toThrow(/Cookie credential/);
});


it.each([
  { name: "adjacent masks", secrets: ["a", "b", "**"], input: "ab" },
  { name: "deletion joins surrounding text", secrets: ["abc", "***", "xy"], input: "xabcy" },
  { name: "mask joins existing text", secrets: ["abc", "***x"], input: "abcx" },
])("checks the final output for $name", async ({ secrets, input }) => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const headers = Object.fromEntries(secrets.map((secret, index) => [`x-secret-${index}`, secret]));
  const output = redactRemoteCredential({ headers }, { [input]: input });
  for (const [key, value] of Object.entries(output)) {
    for (const secret of secrets) {
      expect(key).not.toContain(secret);
      expect(value).not.toContain(secret);
    }
  }
});

it("fails closed when JSON separators reconstruct an opaque credential", async () => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  expect(() => redactRemoteCredential(
    { headers: { "x-api-key": 'foo":"bar' } },
    { foo: "bar" },
    { preserveKeys: true },
  )).toThrow(/safe serialized output/);
});

it("fails closed before a second credential can be hidden by a structural collision", async () => {
  const { redactRemoteCredential, McpFnRedactionLimitError } = await import("../src/remote-target.js");
  expect(() => redactRemoteCredential(
    { headers: { "x-structural": "passed", "x-composed": 'foo":"bar' } },
    { status: "passed", foo: "bar" },
    { preserveKeys: true },
  )).toThrow(McpFnRedactionLimitError);
});

it("rejects credentials that collide with required report keys", async () => {
  const {
    McpFnStructuralCredentialCollisionError,
    redactRemoteCredential,
  } = await import("../src/remote-target.js");
  expect(() => redactRemoteCredential(
    { headers: { "x-api-key": "timeline" } },
    { timeline: [] },
    { preserveKeys: true },
  )).toThrow(McpFnStructuralCredentialCollisionError);
});

it("checks generic redaction markers in the final output", async () => {
  const { redactRemoteCredential } = await import("../src/remote-target.js");
  const output = redactRemoteCredential({ headers: { "x-secret": "[REDACTED]" } }, { password: "unknown" });
  expect(output.password).not.toContain("[REDACTED]");
});

it("fails closed when distinct payload keys redact to the same key", async () => {
  const { redactRemoteCredential, McpFnRedactionLimitError } = await import("../src/remote-target.js");
  expect(() => redactRemoteCredential(
    { headers: { "x-api-key": "opaque-secret" } },
    { "opaque-secret": 1, "[REDACTED]": 2 },
  )).toThrow(McpFnRedactionLimitError);
});
