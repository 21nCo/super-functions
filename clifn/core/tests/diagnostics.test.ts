import {
  createDiagnostic,
  formatDiagnosticsJson,
  formatDiagnosticsText,
  redactDiagnostics,
  redactValue,
  sortDiagnostics,
  type Diagnostic,
} from "../src/diagnostics.js";

describe("diagnostics", () => {
  const unsorted: Diagnostic[] = [
    {
      code: "B",
      severity: "warning",
      message: "b",
      details: {
        token: "secret",
        nested: {
          Authorization: "Bearer secret",
        },
      },
    },
    {
      code: "A",
      severity: "error",
      message: "a",
      details: {
        path: "x",
      },
    },
    {
      code: "C",
      severity: "info",
      message: "c",
      path: "docs/readme.md",
    },
  ];

  it("creates cloned diagnostics", () => {
    const created = createDiagnostic(unsorted[0]);

    expect(created).toEqual(unsorted[0]);
    expect(created).not.toBe(unsorted[0]);
    expect(created.details).not.toBe(unsorted[0].details);
  });

  it("sorts diagnostics deterministically by severity and code", () => {
    const sorted = sortDiagnostics(unsorted);

    expect(sorted.map((diagnostic) => diagnostic.code)).toEqual(["A", "B", "C"]);
  });

  it("redacts sensitive keys by default", () => {
    const redacted = redactDiagnostics(unsorted);

    expect(redacted[0]).toEqual({
      code: "B",
      severity: "warning",
      message: "b",
      details: {
        token: "[REDACTED]",
        nested: {
          Authorization: "[REDACTED]",
        },
      },
    });
  });

  it("redacts arbitrary nested values for structured logging", () => {
    expect(
      redactValue({
        token: "secret",
        nested: [{ password: "hidden" }],
      })
    ).toEqual({
      token: "[REDACTED]",
      nested: [{ password: "[REDACTED]" }],
    });
  });

  it("stays finite when diagnostics contain circular references", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(redactValue(circular)).toEqual({
      self: "[Circular]",
    });

    expect(
      formatDiagnosticsJson([
        {
          code: "CYCLE",
          severity: "warning",
          message: "cycle",
          details: circular,
        },
      ])
    ).toContain('"self":"[Circular]"');
  });

  it("preserves repeated references that are not circular", () => {
    const shared = { value: "same" };

    expect(
      redactValue({
        first: shared,
        second: shared,
      })
    ).toEqual({
      first: { value: "same" },
      second: { value: "same" },
    });

    expect(
      formatDiagnosticsJson([
        {
          code: "SHARED",
          severity: "info",
          message: "shared",
          details: {
            first: shared,
            second: shared,
          },
        },
      ])
    ).toContain('"first":{"value":"same"},"second":{"value":"same"}');
  });

  it("formats diagnostics as stable json", () => {
    expect(formatDiagnosticsJson(unsorted)).toBe(
      '{"diagnostics":[{"code":"A","details":{"path":"x"},"message":"a","severity":"error"},{"code":"B","details":{"nested":{"Authorization":"[REDACTED]"},"token":"[REDACTED]"},"message":"b","severity":"warning"},{"code":"C","message":"c","path":"docs/readme.md","severity":"info"}],"ok":false}\n'
    );
  });

  it("formats diagnostics as stable human-readable text", () => {
    expect(formatDiagnosticsText(unsorted)).toBe(
      "[error] A: a\n  details: {\"path\":\"x\"}\n[warning] B: b\n  details: {\"nested\":{\"Authorization\":\"[REDACTED]\"},\"token\":\"[REDACTED]\"}\n[info] C: c\n  path: docs/readme.md\n"
    );
  });
});
