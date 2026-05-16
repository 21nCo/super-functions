/**
 * Integration tests for `apifn mock` and `apifn snippet` commands.
 *
 * Covers: TV-CLI-007 (mock), TV-CLI-008 (snippet)
 *
 * Note: `apifn serve` is long-lived (blocks on SIGINT) so it's
 * tested via unit-level patterns only. Mock and snippet are testable
 * without signal handling since we use runMockCommand/runSnippetCommand
 * directly in tests (not via the CLI wrapper) or stop the server ourselves.
 */

import path from "node:path";
import { describe, it, expect } from "vitest";
import { runCli } from "../src/index.js";
import { runSnippetCommand } from "../src/commands/snippet.js";
import { runMockCommand } from "../src/commands/mock.js";
import { createOutput } from "../src/utils/output.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures", "diff");
const BEFORE_SPEC = path.join(FIXTURES, "before.yml");

// Minimal output stub
function silentOutput() {
    return createOutput({ quiet: true });
}

// ─── TV-CLI-008: snippet command ──────────────────────────────────────────────

describe("TV-CLI-008: apifn snippet command", () => {
    it("generates curl snippet for a specific path via runSnippetCommand", async () => {
        const lines: string[] = [];
        const code = await runSnippetCommand({
            specPath: BEFORE_SPEC,
            apiPath: "/users",
            method: "get",
            target: "curl",
            baseUrl: "https://api.example.com",
            output: silentOutput(),
            writeStdout: (t) => lines.push(t),
        });

        expect(code).toBe(0);
        const output = lines.join("");
        expect(output).toContain("curl -X GET");
        expect(output).toContain("https://api.example.com/users");
    });

    it("generates fetch snippet for a specific path", async () => {
        const lines: string[] = [];
        await runSnippetCommand({
            specPath: BEFORE_SPEC,
            apiPath: "/users",
            method: "get",
            target: "fetch",
            baseUrl: "https://api.example.com",
            output: silentOutput(),
            writeStdout: (t) => lines.push(t),
        });

        const output = lines.join("");
        expect(output).toContain("await fetch(");
        expect(output).toContain("https://api.example.com/users");
    });

    it("--all generates snippets for all operations", async () => {
        const lines: string[] = [];
        const code = await runSnippetCommand({
            specPath: BEFORE_SPEC,
            target: "curl",
            baseUrl: "https://api.example.com",
            all: true,
            output: silentOutput(),
            writeStdout: (t) => lines.push(t),
        });

        expect(code).toBe(0);
        const output = lines.join("");
        // before.yml has GET /users, GET /users/{id}, DELETE /users/{id}
        expect(output).toContain("/users");
        expect(output).toContain("curl -X GET");
    });

    it("invalid path returns exit 1", async () => {
        const code = await runSnippetCommand({
            specPath: BEFORE_SPEC,
            apiPath: "/nonexistent",
            method: "get",
            target: "curl",
            output: silentOutput(),
        });

        expect(code).toBe(1);
    });

    it("invalid target returns exit 1", async () => {
        const code = await runSnippetCommand({
            specPath: BEFORE_SPEC,
            apiPath: "/users",
            target: "unknown-lang",
            output: silentOutput(),
        });

        expect(code).toBe(1);
    });

    it("missing spec file returns exit 2", async () => {
        const code = await runSnippetCommand({
            specPath: "/tmp/__no_such_spec.yml",
            apiPath: "/users",
            target: "curl",
            output: silentOutput(),
        });

        expect(code).toBe(2);
    });

    it("snippet via CLI wrapper produces curl output", async () => {
        const lines: string[] = [];
        const code = await runCli(
            ["snippet", BEFORE_SPEC, "/users", "--target", "curl", "--base-url", "https://api.test"],
            { stdout: (t) => lines.push(t) }
        );

        expect(code).toBe(0);
        const output = lines.join("");
        expect(output).toContain("curl -X GET");
        expect(output).toContain("https://api.test/users");
    });

    it("snippet --all via CLI wrapper generates multiple operations", async () => {
        const lines: string[] = [];
        const code = await runCli(
            ["snippet", BEFORE_SPEC, "--all", "--target", "fetch"],
            { stdout: (t) => lines.push(t) }
        );

        expect(code).toBe(0);
        const output = lines.join("");
        expect(output).toContain("await fetch(");
    });
});

// ─── TV-CLI-007: mock command ─────────────────────────────────────────────────

describe("TV-CLI-007: apifn mock command (runMockCommand unit-level)", () => {
    it("missing spec file returns exit 2", async () => {
        const code = await runMockCommand({
            specPath: "/tmp/__no_spec.yml",
            output: silentOutput(),
        });
        expect(code).toBe(2);
    });

    it("starts mock server on a port and responds correctly", async () => {
        // We start from the raw module to control lifecycle; we can't use CLI for long-lived servers
        const { createMockServer } = await import("@apifn/mock");
        const { parseOpenAPI } = await import("@apifn/core");
        const { readFile } = await import("node:fs/promises");

        const raw = await readFile(BEFORE_SPEC, "utf8");
        const spec = parseOpenAPI(raw);
        const mock = createMockServer({ spec, port: 0 });
        await mock.start();

        const res = await fetch(`http://localhost:${mock.port}/users`);
        expect(res.status).toBe(200);

        await mock.stop();
    });

    it("mock server with --mode examples returns 200", async () => {
        const { createMockServer } = await import("@apifn/mock");
        const { parseOpenAPI } = await import("@apifn/core");
        const { readFile } = await import("node:fs/promises");

        const raw = await readFile(BEFORE_SPEC, "utf8");
        const spec = parseOpenAPI(raw);
        const mock = createMockServer({ spec, port: 0, responseMode: "examples" });
        await mock.start();

        const res = await fetch(`http://localhost:${mock.port}/users`);
        expect([200, 204]).toContain(res.status);

        await mock.stop();
    });
});
