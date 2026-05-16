/**
 * Human-readable and JSON formatters for DiffResult.
 *
 * Implements DIFF-009.
 */

import type { DiffResult, DiffEntry } from "../types.js";

// ---------------------------------------------------------------------------
// JSON format (DIFF-009, SPEC Section 6.5)
// ---------------------------------------------------------------------------

export interface DiffReportJson {
    timestamp: string;
    hasBreakingChanges: boolean;
    summary: DiffResult["summary"];
    breaking: DiffEntry[];
    nonBreaking: DiffEntry[];
}

/**
 * Serialize a DiffResult to the SPEC 6.5 JSON format.
 */
export function formatDiffAsJson(result: DiffResult, timestamp?: string): DiffReportJson {
    return {
        timestamp: timestamp ?? new Date().toISOString(),
        hasBreakingChanges: result.hasBreakingChanges,
        summary: result.summary,
        breaking: result.breaking,
        nonBreaking: result.nonBreaking,
    };
}

// ---------------------------------------------------------------------------
// Human-readable text format (DIFF-009)
// ---------------------------------------------------------------------------

/**
 * Render a DiffResult as a human-readable text table.
 * Caller can pass a `color` function map for terminal styling.
 */
export function formatDiffAsText(
    result: DiffResult,
    colors?: {
        red?: (s: string) => string;
        green?: (s: string) => string;
        yellow?: (s: string) => string;
        bold?: (s: string) => string;
        dim?: (s: string) => string;
    }
): string {
    const c = {
        red: colors?.red ?? ((s: string) => s),
        green: colors?.green ?? ((s: string) => s),
        yellow: colors?.yellow ?? ((s: string) => s),
        bold: colors?.bold ?? ((s: string) => s),
        dim: colors?.dim ?? ((s: string) => s),
    };

    const lines: string[] = [];

    lines.push(c.bold("API Diff Report"));
    lines.push("─".repeat(60));

    // Summary
    const s = result.summary;
    lines.push(`Added:       ${c.green(String(s.added))}`);
    lines.push(`Removed:     ${s.removed > 0 ? c.red(String(s.removed)) : String(s.removed)}`);
    lines.push(`Modified:    ${String(s.modified)}`);
    lines.push(`Breaking:    ${s.breaking > 0 ? c.red(String(s.breaking)) : String(s.breaking)}`);
    lines.push(`Non-breaking:${String(s.nonBreaking)}`);
    lines.push("─".repeat(60));

    if (result.breaking.length > 0) {
        lines.push(c.bold(c.red("Breaking Changes:")));
        for (const entry of result.breaking) {
            const icon = entry.type === "removed" ? "–" : entry.type === "added" ? "+" : "~";
            lines.push(`  ${c.red(icon)} ${entry.description}`);
            lines.push(`    ${c.dim(`path: ${entry.path}`)}`);
        }
        lines.push("");
    }

    if (result.nonBreaking.length > 0) {
        lines.push(c.bold("Non-Breaking Changes:"));
        for (const entry of result.nonBreaking) {
            const icon = entry.type === "removed" ? "–" : entry.type === "added" ? "+" : "~";
            lines.push(`  ${icon} ${entry.description}`);
            lines.push(`    ${c.dim(`path: ${entry.path}`)}`);
        }
        lines.push("");
    }

    if (result.breaking.length === 0 && result.nonBreaking.length === 0) {
        lines.push(c.green("No changes detected."));
    }

    lines.push("─".repeat(60));
    if (result.hasBreakingChanges) {
        lines.push(c.red(c.bold(`⚠ ${result.summary.breaking} breaking change(s) detected!`)));
    } else {
        lines.push(c.green("✓ No breaking changes."));
    }

    return lines.join("\n");
}
