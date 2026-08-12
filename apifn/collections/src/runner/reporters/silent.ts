/**
 * Silent reporter — no output (for programmatic/embedded use).
 */

import type { RunReporter } from "../../types.js";

/**
 * Returns a RunReporter that produces no output whatsoever.
 * Useful when consuming apifn programmatically and handling output manually.
 */
export function createSilentReporter(): RunReporter {
    return {};
}
