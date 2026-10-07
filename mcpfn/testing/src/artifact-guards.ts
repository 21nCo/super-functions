import { McpFnClientError } from "@mcpfn/client";

import type { McpFnTargetSuiteReport } from "./suite.js";

interface McpFnTargetSuiteArtifactGuard {
  maxBytes: number;
  validate(value: string): boolean;
  release(): void;
}

const targetSuiteArtifactGuards = new WeakMap<
  McpFnTargetSuiteReport,
  McpFnTargetSuiteArtifactGuard
>();
const targetSuiteArtifactFinalizer = new FinalizationRegistry<() => void>(release => {
  try { release(); } catch {}
});

/** Retain target-aware proof for artifacts derived after suite execution. */
export function registerMcpFnTargetSuiteArtifactGuard(
  report: McpFnTargetSuiteReport,
  validate: (value: string) => boolean,
  release: () => void,
  maxBytes: number,
): void {
  const previous = targetSuiteArtifactGuards.get(report);
  if (previous) {
    targetSuiteArtifactFinalizer.unregister(report);
    targetSuiteArtifactGuards.delete(report);
    previous.release();
  }
  let active = true;
  const releaseOnce = () => {
    if (!active) return;
    active = false;
    release();
  };
  targetSuiteArtifactGuards.set(report, { maxBytes, validate, release: releaseOnce });
  targetSuiteArtifactFinalizer.register(report, releaseOnce, report);
}

export function disposeMcpFnTargetSuiteArtifactGuard(
  report: McpFnTargetSuiteReport,
): void {
  const guard = targetSuiteArtifactGuards.get(report);
  if (!guard) return;
  targetSuiteArtifactGuards.delete(report);
  targetSuiteArtifactFinalizer.unregister(report);
  guard.release();
}

export function preserveMcpFnTargetSuiteArtifact(
  report: McpFnTargetSuiteReport,
  artifact: string,
): string {
  const guard = targetSuiteArtifactGuards.get(report);
  if (!guard) {
    if (report.artifactValidation === "target-aware") {
      throw new McpFnClientError(
        "MCPFN_OPERATION_FAILED",
        "MCP target artifact proof is unavailable",
        { phase: "capability-operation" },
      );
    }
    return artifact;
  }
  if (new TextEncoder().encode(artifact).byteLength > guard.maxBytes) {
    throw new Error("Serialized target suite artifact exceeds maxReportBytes");
  }
  try {
    if (!guard.validate(artifact)) throw new Error("unsafe serialized artifact");
    return artifact;
  } catch {
    throw new McpFnClientError(
      "MCPFN_OPERATION_FAILED",
      "MCP artifact structure conflicts with credential redaction",
      { phase: "capability-operation" },
    );
  }
}
