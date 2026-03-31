import { createExec } from "../src/exec.js";

describe("createExec", () => {
  it("captures stdout, stderr, env, cwd, and duration deterministically", async () => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const exec = createExec();

    const result = await exec.command(
      process.execPath,
      [
        "-e",
        "process.stdout.write(`cwd=${process.cwd()}\\nflag=${process.env.TEST_FLAG}\\n`); process.stderr.write('warn\\n');",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TEST_FLAG: "set",
        },
        streamOutput: true,
        stdout: (chunk) => stdoutChunks.push(chunk),
        stderr: (chunk) => stderrChunks.push(chunk),
      }
    );

    expect(result.command).toContain(process.execPath);
    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toContain(`cwd=${process.cwd()}\n`);
    expect(result.stdout).toContain("flag=set\n");
    expect(result.stderr).toBe("warn\n");
    expect(result.timedOut).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(stdoutChunks.join("")).toBe(result.stdout);
    expect(stderrChunks.join("")).toBe(result.stderr);
  });

  it("reports timeouts explicitly", async () => {
    const exec = createExec();

    await expect(
      exec.command(process.execPath, ["-e", "setTimeout(() => {}, 50)"], {
        timeoutMs: 10,
      })
    ).rejects.toMatchObject({
      code: "CLIFN_EXEC_TIMEOUT",
      message: "Command timed out after 10 ms.",
      result: expect.objectContaining({
        timedOut: true,
      }),
    });
  });

  it("escalates timed-out processes that ignore SIGTERM", async () => {
    const exec = createExec();

    await expect(
      exec.command(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 50)"], {
        timeoutMs: 10,
      })
    ).rejects.toMatchObject({
      code: "CLIFN_EXEC_TIMEOUT",
      result: expect.objectContaining({
        timedOut: true,
      }),
    });
  });

  it("does not split utf-8 characters when truncating buffered output", async () => {
    const exec = createExec();

    const result = await exec.command(
      process.execPath,
      ["-e", "process.stdout.write('😀😀😀')"],
      {
        maxBufferBytes: 10,
      }
    );

    expect(result.stdout).toBe("😀😀");
  });
});
