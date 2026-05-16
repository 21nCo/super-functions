/**
 * Integration tests for `apifn diff` command.
 *
 * Covers: TV-CLI-005, TV-CI-002, CI-003 (JSON format).
 */

import path from "node:path";
import { describe, it, expect } from "vitest";
import { runCli } from "../src/index.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures", "diff");
const BEFORE = path.join(FIXTURES, "before.yml");
const AFTER_BREAKING = path.join(FIXTURES, "after-breaking.yml");
const AFTER_NONBREAKING = path.join(FIXTURES, "after-nonbreaking.yml");

describe("apifn diff command — CLI-005, CI-002, CI-003", () => {
    it("TV-CLI-005: human-readable output contains key sections", async () => {
        const lines: string[] = [];
        await runCli(["diff", BEFORE, AFTER_BREAKING], {
            stdout: (t) => lines.push(t),
        });

        const output = lines.join("");
        expect(output).toContain("API Diff Report");
        expect(output).toContain("Breaking Changes");
    });

    it("TV-CI-002 + TV-CLI-005: breaking changes → exit 1", async () => {
        const code = await runCli(["diff", BEFORE, AFTER_BREAKING], {
            stdout: () => { },
        });

        expect(code).toBe(1);
    });

    it("TV-CI-002: non-breaking changes → exit 0", async () => {
        const code = await runCli(["diff", BEFORE, AFTER_NONBREAKING], {
            stdout: () => { },
        });

        expect(code).toBe(0);
    });

    it("TV-CI-002: identical specs → exit 0 with no changes", async () => {
        const lines: string[] = [];
        const code = await runCli(["diff", BEFORE, BEFORE], {
            stdout: (t) => lines.push(t),
        });

        expect(code).toBe(0);
        const output = lines.join("");
        expect(output).toContain("No changes detected");
    });

    it("CI-003: --format json → valid JSON on stdout with SPEC 6.5 shape", async () => {
        let raw = "";
        const code = await runCli(["diff", BEFORE, AFTER_BREAKING, "--format", "json"], {
            stdout: (t) => { raw += t; },
        });

        expect(code).toBe(1);
        const json = JSON.parse(raw) as {
            hasBreakingChanges: boolean;
            summary: { breaking: number; nonBreaking: number; added: number; removed: number; modified: number };
            breaking: unknown[];
            nonBreaking: unknown[];
            timestamp: string;
        };
        expect(json.hasBreakingChanges).toBe(true);
        expect(json.summary.breaking).toBeGreaterThan(0);
        expect(json.timestamp).toBeTruthy();
        expect(Array.isArray(json.breaking)).toBe(true);
        expect(Array.isArray(json.nonBreaking)).toBe(true);
    });

    it("CI-003: --format json for non-breaking → hasBreakingChanges false", async () => {
        let raw = "";
        await runCli(["diff", BEFORE, AFTER_NONBREAKING, "--format", "json"], {
            stdout: (t) => { raw += t; },
        });

        const json = JSON.parse(raw) as { hasBreakingChanges: boolean; summary: { breaking: number } };
        expect(json.hasBreakingChanges).toBe(false);
        expect(json.summary.breaking).toBe(0);
    });

    it("TV-CI-002: --fail-on-breaking false → exit 0 even with breaking changes", async () => {
        const code = await runCli(
            ["diff", BEFORE, AFTER_BREAKING, "--no-fail-on-breaking"],
            { stdout: () => { } }
        );

        // --no-fail-on-breaking sets failOnBreaking=false
        expect(code).toBe(0);
    });

    it("TV-CLI-005 + CI-002: missing file → exit 2", async () => {
        const code = await runCli(["diff", "/tmp/__nonexistent.yml", BEFORE]);
        expect(code).toBe(2);
    });

    it("TV-CLI-005: non-breaking output shows added endpoint", async () => {
        const lines: string[] = [];
        await runCli(["diff", BEFORE, AFTER_NONBREAKING], {
            stdout: (t) => lines.push(t),
        });
        const output = lines.join("");
        // Should mention the new /orders endpoint (non-breaking addition)
        expect(output).toContain("orders");
        expect(output).toContain("No breaking changes");
    });

    it("TV-CLI-005: breaking output identifies specific breaking changes", async () => {
        let raw = "";
        await runCli(["diff", BEFORE, AFTER_BREAKING, "--format", "json"], {
            stdout: (t) => { raw += t; },
        });

        const json = JSON.parse(raw) as { breaking: Array<{ type: string; description: string }> };
        // Should have: delete endpoint removed, required param added, response field removed
        const types = json.breaking.map((e) => e.type);
        expect(types).toContain("removed"); // delete endpoint removed
        expect(json.breaking.some((e) => e.description.toLowerCase().includes("required"))).toBe(true);
    });
});
