import { spawn } from "node:child_process";
import path from "node:path";

export const OFFICIAL_CONFORMANCE_VERSION = "0.1.16";

export interface OfficialConformanceOptions {
  url: string;
  suite?: "active" | "all" | "pending";
  scenario?: string;
  expectedFailures?: string;
  outputDir?: string;
  specVersion?: string;
  verbose?: boolean;
  cwd?: string;
  stdio?: "inherit" | "pipe";
}

export interface OfficialConformanceResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function buildOfficialConformanceArgs(
  options: OfficialConformanceOptions,
): string[] {
  const args = [
    "--yes",
    `@modelcontextprotocol/conformance@${OFFICIAL_CONFORMANCE_VERSION}`,
    "server",
    "--url",
    options.url,
  ];
  if (options.suite) args.push("--suite", options.suite);
  if (options.scenario) args.push("--scenario", options.scenario);
  if (options.expectedFailures) {
    args.push("--expected-failures", options.expectedFailures);
  }
  if (options.outputDir) args.push("--output-dir", options.outputDir);
  if (options.specVersion) args.push("--spec-version", options.specVersion);
  if (options.verbose) args.push("--verbose");
  return args;
}

export async function runOfficialConformance(
  options: OfficialConformanceOptions,
): Promise<OfficialConformanceResult> {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (nodeMajor < 22) {
    throw new Error(
      `Official MCP conformance ${OFFICIAL_CONFORMANCE_VERSION} requires Node.js 22 or newer; current runtime is ${process.versions.node}`,
    );
  }
  const args = buildOfficialConformanceArgs(options);

  return await new Promise<OfficialConformanceResult>((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), process.env.PATH]
          .filter(Boolean)
          .join(path.delimiter),
      },
      stdio: options.stdio === "inherit" ? "inherit" : "pipe",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
