import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
} from "node:http";
import { request as httpsRequest } from "node:https";
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

export interface AuthenticatedConformanceProxy {
  /** Loopback URL to pass to the official conformance runner. */
  url: string;
  close(): Promise<void>;
}

export interface AuthenticatedConformanceProxyOptions {
  /** Fixed loopback MCP URL. Requests cannot select a different origin or path. */
  url: string;
  /** Headers injected into every upstream request. Values are never logged. */
  headers: HeadersInit;
}

export interface AuthenticatedOfficialConformanceOptions extends OfficialConformanceOptions {
  headers: HeadersInit;
}

/**
 * Start a loopback-only streaming proxy for runners that cannot send auth
 * headers. The proxy has one fixed upstream origin and injected headers always
 * replace client-supplied values.
 */
export async function createAuthenticatedConformanceProxy(
  options: AuthenticatedConformanceProxyOptions,
): Promise<AuthenticatedConformanceProxy> {
  const upstream = new URL(options.url);
  if (!["http:", "https:"].includes(upstream.protocol)) {
    throw new TypeError(
      "Authenticated conformance upstream must use HTTP or HTTPS",
    );
  }
  if (upstream.username || upstream.password || upstream.hash) {
    throw new TypeError(
      "Authenticated conformance upstream must not contain userinfo or a fragment",
    );
  }
  const hostname = normalizeLoopbackHostname(upstream.hostname);
  if (!hostname) {
    throw new TypeError(
      "Authenticated conformance upstream must use a literal loopback address",
    );
  }
  const protocol = upstream.protocol === "https:" ? "https:" : "http:";
  const port = upstream.port === "" ? undefined : Number(upstream.port);
  const requestPath = `${upstream.pathname}${upstream.search}`;
  const injected = new Headers(options.headers);
  const server = createServer((incoming, outgoing) => {
    if (!incoming.url?.startsWith("/")) {
      outgoing.writeHead(400).end();
      return;
    }
    const headers: IncomingHttpHeaders = { ...incoming.headers };
    delete headers.connection;
    // Preserve Host so the official suite can exercise DNS-rebinding defenses;
    // the outbound socket and request path remain fixed below.
    injected.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    const transport = protocol === "https:" ? httpsRequest : httpRequest;
    const proxied = transport(
      {
        protocol,
        hostname,
        port,
        path: requestPath,
        method: incoming.method,
        headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    proxied.once("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.once("aborted", () => proxied.destroy());
    incoming.pipe(proxied);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("Authenticated conformance proxy did not bind a TCP port");
  }
  const url = new URL(
    upstream.pathname + upstream.search,
    `http://127.0.0.1:${address.port}`,
  );
  return {
    url: url.toString(),
    close: async () => {
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function normalizeLoopbackHostname(
  hostname: string,
): "127.0.0.1" | "::1" | undefined {
  if (hostname === "127.0.0.1") return "127.0.0.1";
  if (hostname === "[::1]") return "::1";
  return undefined;
}

function npxInvocation(args: string[]): { command: string; args: string[] } {
  if (process.platform !== "win32") return { command: "npx", args };
  const npmExecPath = process.env.npm_execpath;
  const candidates = [
    npmExecPath ? path.join(path.dirname(npmExecPath), "npx-cli.js") : undefined,
    path.resolve(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js"),
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npx-cli.js"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const npxCli = candidates.find((candidate) => existsSync(candidate));
  if (!npxCli) {
    throw new Error("Unable to locate npm's npx-cli.js for the official MCP conformance runner");
  }
  return { command: process.execPath, args: [npxCli, ...args] };
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
  const invocation = npxInvocation(args);

  return await new Promise<OfficialConformanceResult>((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
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

/** Run the pinned official suite against an authenticated MCP endpoint. */
export async function runAuthenticatedOfficialConformance(
  options: AuthenticatedOfficialConformanceOptions,
): Promise<OfficialConformanceResult> {
  const { headers, ...conformance } = options;
  const proxy = await createAuthenticatedConformanceProxy({
    url: conformance.url,
    headers,
  });
  try {
    return await runOfficialConformance({ ...conformance, url: proxy.url });
  } finally {
    await proxy.close();
  }
}
