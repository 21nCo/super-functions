import { ui } from "../src/ui.js";

describe("ui", () => {
  it("preserves compatibility over the new output service", () => {
    vi.useFakeTimers();

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    ui.success("ok");
    ui.warn("warn");
    ui.info("info");
    ui.error("error");
    ui.table([
      { name: "spec", status: "active" },
      { name: "phase", status: "pending" },
    ]);

    const spinner = ui.spinner("loading");
    spinner.start();
    vi.advanceTimersByTime(90);
    spinner.succeed("done");

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("[ok] ok"));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("[!] warn"));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("[i] info"));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("[x] error"));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("name  | status"));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("[ok] done"));

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.useRealTimers();
  });
});
