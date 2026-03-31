import { createOutput } from "../src/output.js";

describe("createOutput", () => {
  it("writes deterministic text output with injected writers", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const output = createOutput({
      color: false,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    output.debug("hidden");
    output.info("info");
    output.success("done");
    output.warn("careful");
    output.error("bad");

    expect(stdout.join("")).toBe("[i] info\n[ok] done\n[!] careful\n");
    expect(stderr.join("")).toBe("[x] bad\n");
  });

  it("uses verbose mode to include debug output", () => {
    const stdout: string[] = [];
    const output = createOutput({
      color: false,
      verbose: true,
      stdout: (text) => stdout.push(text),
    });

    output.debug("details", { step: 1 });

    expect(stdout.join("")).toBe('[d] details {"step":1}\n');
  });

  it("uses quiet mode to suppress non-error text output", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const output = createOutput({
      color: false,
      quiet: true,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    output.info("info");
    output.success("done");
    output.warn("warn");
    output.error("bad");
    output.table({
      columns: ["name"],
      rows: [{ name: "spec" }],
    });

    expect(stdout.join("")).toBe("");
    expect(stderr.join("")).toBe("[x] bad\n");
  });

  it("writes exactly one newline-terminated JSON document", () => {
    const stdout: string[] = [];
    const output = createOutput({
      mode: "json",
      stdout: (text) => stdout.push(text),
    });

    output.json({ ok: true, message: "done" });

    expect(stdout.join("")).toBe('{"ok":true,"message":"done"}\n');
  });

  it("normalizes top-level undefined to valid json output", () => {
    const stdout: string[] = [];
    const output = createOutput({
      mode: "json",
      stdout: (text) => stdout.push(text),
    });

    output.json(undefined);

    expect(stdout.join("")).toBe("null\n");
  });

  it("serializes circular values and bigint safely in json mode", () => {
    const stdout: string[] = [];
    const output = createOutput({
      mode: "json",
      stdout: (text) => stdout.push(text),
    });
    const value: Record<string, unknown> = {
      count: 7n,
    };
    value.self = value;

    output.json(value);

    expect(stdout.join("")).toBe('{"count":"7","self":"[Circular]"}\n');
  });

  it("serializes circular values and bigint safely in text details", () => {
    const stdout: string[] = [];
    const output = createOutput({
      color: false,
      stdout: (text) => stdout.push(text),
    });
    const details: Record<string, unknown> = {
      count: 7n,
    };
    details.self = details;

    output.info("info", details);

    expect(stdout.join("")).toBe('[i] info {"count":"7","self":"[Circular]"}\n');
  });

  it("preserves native toJSON semantics for values like Date", () => {
    const stdout: string[] = [];
    const output = createOutput({
      mode: "json",
      stdout: (text) => stdout.push(text),
    });

    output.json({
      createdAt: new Date("2026-03-31T11:38:11.000Z"),
    });

    expect(stdout.join("")).toBe('{"createdAt":"2026-03-31T11:38:11.000Z"}\n');
  });

  it("renders tables using declared column order", () => {
    const stdout: string[] = [];
    const output = createOutput({
      color: false,
      stdout: (text) => stdout.push(text),
    });

    output.table({
      columns: ["status", "name"],
      rows: [
        { name: "spec", status: "active" },
        { name: "phase", status: "pending" },
      ],
    });

    expect(stdout.join("")).toBe(
      "status  | name \n------- | -----\nactive  | spec \npending | phase\n"
    );
  });

  it("keeps spinner support available behind the output service", () => {
    vi.useFakeTimers();

    const stdout: string[] = [];
    const stderr: string[] = [];
    const output = createOutput({
      color: false,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    const spinner = output.spinner("loading");
    spinner.start();
    vi.advanceTimersByTime(90);
    spinner.succeed("done");

    expect(stderr.join("")).toContain("\r- loading");
    expect(stderr.join("")).toContain("[ok] done\n");
    expect(stdout.join("")).toBe("");

    vi.useRealTimers();
  });
});
