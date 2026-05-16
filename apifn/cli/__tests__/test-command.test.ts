/**
 * Integration tests for `apifn test` command.
 *
 * Covers: TV-CLI-004, TV-CLI-011 (test-specific exit codes).
 */

import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCli } from "../src/index.js";

async function startEchoServer(port: number, handler: (status: number, body: string) => void = () => { }): Promise<{ close: () => Promise<void> }> {
    const server = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
    });

    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

    return {
        close: () =>
            new Promise<void>((resolve, reject) =>
                server.close((err) => (err ? reject(err) : resolve()))
            ),
    };
}

async function startFailingServer(port: number): Promise<{ close: () => Promise<void> }> {
    const server = createServer((_req, res) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
    });

    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

    return {
        close: () =>
            new Promise<void>((resolve, reject) =>
                server.close((err) => (err ? reject(err) : resolve()))
            ),
    };
}

/** Create a minimal passing collection in a temp dir */
async function createPassingCollection(baseUrl: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "apifn-test-pass-"));

    await writeFile(
        path.join(dir, "opencollection.yml"),
        "name: Passing Test Collection\ntype: collection\n",
        "utf8"
    );

    await mkdir(path.join(dir, "environments"), { recursive: true });
    await writeFile(
        path.join(dir, "environments", "development.yml"),
        `name: development\nvariables:\n  baseUrl: "${baseUrl}"\n`,
        "utf8"
    );

    // A request that will succeed (server returns 200 which is < 400 → "passed")
    await writeFile(
        path.join(dir, "health.yml"),
        [
            "info:",
            "  name: Health Check",
            "  type: http",
            "  seq: 1",
            "http:",
            "  method: GET",
            "  url: '{{baseUrl}}/health'",
            "",
        ].join("\n"),
        "utf8"
    );

    return dir;
}

/** Create a minimal failing collection in a temp dir */
async function createFailingCollection(baseUrl: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "apifn-test-fail-"));

    await writeFile(
        path.join(dir, "opencollection.yml"),
        "name: Failing Test Collection\ntype: collection\n",
        "utf8"
    );

    await mkdir(path.join(dir, "environments"), { recursive: true });
    await writeFile(
        path.join(dir, "environments", "development.yml"),
        `name: development\nvariables:\n  baseUrl: "${baseUrl}"\n`,
        "utf8"
    );

    // A request to a 500-returning server → "failed" status
    await writeFile(
        path.join(dir, "fail.yml"),
        [
            "info:",
            "  name: Failing Request",
            "  type: http",
            "  seq: 1",
            "http:",
            "  method: GET",
            "  url: '{{baseUrl}}/error'",
            "",
        ].join("\n"),
        "utf8"
    );

    return dir;
}

describe("apifn test command — CLI-004, CLI-011, RUN-009", () => {
    const PASS_PORT = 19977;
    const FAIL_PORT = 19978;
    let passServer: { close: () => Promise<void> };
    let failServer: { close: () => Promise<void> };
    let passDir: string;
    let failDir: string;

    beforeAll(async () => {
        passServer = await startEchoServer(PASS_PORT);
        failServer = await startFailingServer(FAIL_PORT);
        passDir = await createPassingCollection(`http://127.0.0.1:${PASS_PORT}`);
        failDir = await createFailingCollection(`http://127.0.0.1:${FAIL_PORT}`);
    });

    afterAll(async () => {
        await passServer.close();
        await failServer.close();
    });

    it("TV-CLI-004 + TV-CLI-011: passing collection exits 0 with console reporter", async () => {
        const lines: string[] = [];
        const code = await runCli(["test", passDir, "--env", "development"], {
            stdout: (t) => lines.push(t),
        });

        expect(code).toBe(0);
        const output = lines.join("");
        expect(output).toContain("PASS");
        expect(output).toContain("Passed:  1");
    });

    it("TV-CLI-004 + TV-CLI-011: failing collection exits 1 with console reporter", async () => {
        const lines: string[] = [];
        const code = await runCli(["test", failDir, "--env", "development"], {
            stdout: (t) => lines.push(t),
        });

        expect(code).toBe(1);
        const output = lines.join("");
        expect(output).toContain("FAIL");
        expect(output).toContain("Failed:  1");
    });

    it("TV-CLI-004 + TV-CLI-011: passing collection exits 0 with json reporter — valid JSON on stdout", async () => {
        let jsonOutput = "";
        const code = await runCli(["test", passDir, "--env", "development", "--reporter", "json"], {
            stdout: (t) => {
                jsonOutput += t;
            },
        });

        expect(code).toBe(0);
        const report = JSON.parse(jsonOutput) as {
            collectionName: string;
            summary: { passed: number; failed: number; total: number };
        };
        expect(report.collectionName).toBe("Passing Test Collection");
        expect(report.summary.passed).toBe(1);
        expect(report.summary.failed).toBe(0);
        expect(report.summary.total).toBe(1);
    });

    it("TV-CLI-011: invalid collection dir exits 2", async () => {
        const code = await runCli(["test", "/tmp/__nonexistent_apifn_test_dir__", "--env", "development"]);
        expect(code).toBe(2);
    });

    it("--silent reporter produces no output", async () => {
        const lines: string[] = [];
        const code = await runCli(["test", passDir, "--env", "development", "--reporter", "silent"], {
            stdout: (t) => lines.push(t),
        });

        expect(code).toBe(0);
        expect(lines.length).toBe(0);
    });

    it("supports include/env-var/output and junit reporter", async () => {
        const outputPath = path.join(await mkdtemp(path.join(tmpdir(), "apifn-junit-")), "report.xml");
        const lines: string[] = [];
        const code = await runCli([
            "test",
            passDir,
            "--env",
            "development",
            "--include",
            "*health*",
            "--env-var",
            "EXTRA=value",
            "--reporter",
            "junit",
            "--output",
            outputPath,
        ], {
            stdout: (t) => lines.push(t),
        });

        expect(code).toBe(0);
        const stdout = lines.join("");
        expect(stdout).toContain("<testsuite");
        const artifact = await readFile(outputPath, "utf8");
        expect(artifact).toContain("<testcase");
    });

    it("--bail flag stops on first failure", async () => {
        // Create a collection with 2 requests in a temp dir (both will fail,
        // but with --bail only 1 should execute before stopping)
        const dir = await mkdtemp(path.join(tmpdir(), "apifn-bail-"));

        await writeFile(
            path.join(dir, "opencollection.yml"),
            "name: Bail Test\ntype: collection\n",
            "utf8"
        );
        await mkdir(path.join(dir, "environments"), { recursive: true });
        await writeFile(
            path.join(dir, "environments", "development.yml"),
            `name: development\nvariables:\n  baseUrl: "http://127.0.0.1:${FAIL_PORT}"\n`,
            "utf8"
        );
        await writeFile(
            path.join(dir, "request1.yml"),
            "info:\n  name: Request 1\n  type: http\n  seq: 1\nhttp:\n  method: GET\n  url: '{{baseUrl}}/one'\n",
            "utf8"
        );
        await writeFile(
            path.join(dir, "request2.yml"),
            "info:\n  name: Request 2\n  type: http\n  seq: 2\nhttp:\n  method: GET\n  url: '{{baseUrl}}/two'\n",
            "utf8"
        );

        let jsonOutput = "";
        const code = await runCli(
            ["test", dir, "--env", "development", "--bail", "--reporter", "json"],
            { stdout: (t) => { jsonOutput += t; } }
        );

        expect(code).toBe(1);
        const report = JSON.parse(jsonOutput) as {
            results: Array<{ status: string }>;
            summary: { failed: number; skipped: number };
        };
        // With bail: first request fails, second should be skipped
        expect(report.results[0]?.status).toBe("failed");
        expect(report.results[1]?.status).toBe("skipped");
        expect(report.summary.skipped).toBe(1);
    });

    it("RUN-009: console reporter emits per-request pass/fail and summary", async () => {
        const lines: string[] = [];
        await runCli(["test", passDir, "--env", "development"], {
            stdout: (t) => lines.push(t),
        });

        const output = lines.join("");
        // Should have header, request line, dashes, results section
        expect(output).toContain("apifn test");
        expect(output).toContain("Health Check");
        expect(output).toContain("Results");
        expect(output).toContain("All tests passed!");
    });
});
