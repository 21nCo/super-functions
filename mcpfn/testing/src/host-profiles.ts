import {
  MCP_APP_EXTENSION_ID,
  type McpFnManifest,
} from "@mcpfn/core";

export type McpFnServerFeature =
  | "tools"
  | "resources"
  | "prompts"
  | "completions"
  | "tasks"
  | "logging";

export interface McpFnHostProfile {
  id: string;
  name: string;
  protocolVersions: string[];
  serverFeatures: McpFnServerFeature[];
  clientFeatures?: {
    sampling?: boolean;
    elicitation?: Array<"form" | "url">;
    roots?: boolean;
  };
  extensions?: string[];
}

export interface McpFnHostCompatibilityIssue {
  severity: "incompatible" | "degraded";
  code: string;
  path: string;
  message: string;
}

export interface McpFnHostCompatibilityResult {
  status: "compatible" | "degraded" | "incompatible";
  compatible: boolean;
  issues: McpFnHostCompatibilityIssue[];
}

export const MCPFN_HOST_PROFILES = {
  toolsOnly: {
    id: "mcpfn/tools-only",
    name: "Tools-only MCP host",
    protocolVersions: ["2025-03-26", "2025-06-18", "2025-11-25"],
    serverFeatures: ["tools"],
  },
  fullProtocol: {
    id: "mcpfn/full-protocol",
    name: "Full protocol MCP host",
    protocolVersions: ["2025-03-26", "2025-06-18", "2025-11-25"],
    serverFeatures: ["tools", "resources", "prompts", "completions", "tasks", "logging"],
    clientFeatures: { sampling: true, elicitation: ["form", "url"], roots: true },
  },
  mcpApps: {
    id: "mcpfn/mcp-apps",
    name: "Full protocol host with MCP Apps",
    protocolVersions: ["2025-11-25"],
    serverFeatures: ["tools", "resources", "prompts", "completions", "tasks", "logging"],
    clientFeatures: { sampling: true, elicitation: ["form", "url"], roots: true },
    extensions: [MCP_APP_EXTENSION_ID],
  },
} as const satisfies Record<string, McpFnHostProfile>;

export function checkHostCompatibility(
  manifest: McpFnManifest,
  profile: McpFnHostProfile,
): McpFnHostCompatibilityResult {
  const issues: McpFnHostCompatibilityIssue[] = [];
  if (
    manifest.protocolVersions?.length &&
    !manifest.protocolVersions.some((version) => profile.protocolVersions.includes(version))
  ) {
    issues.push({
      severity: "incompatible",
      code: "protocol-version-mismatch",
      path: "protocolVersions",
      message: `${profile.name} and ${manifest.server.name} have no protocol version in common`,
    });
  }

  const supportedServerFeatures = new Set(profile.serverFeatures);
  for (const feature of Object.keys(manifest.capabilities ?? {})) {
    if (
      feature === "experimental" ||
      supportedServerFeatures.has(feature as McpFnServerFeature)
    ) continue;
    issues.push({
      severity: "degraded",
      code: "server-feature-unavailable",
      path: `capabilities.${feature}`,
      message: `${profile.name} will not expose the server's ${feature} feature`,
    });
  }

  const required = manifest.clientRequirements;
  if (required?.sampling && !profile.clientFeatures?.sampling) {
    issues.push({
      severity: "incompatible",
      code: "sampling-required",
      path: "clientRequirements.sampling",
      message: `${manifest.server.name} requires client sampling`,
    });
  }
  if (required?.roots && !profile.clientFeatures?.roots) {
    issues.push({
      severity: "incompatible",
      code: "roots-required",
      path: "clientRequirements.roots",
      message: `${manifest.server.name} requires client roots`,
    });
  }
  for (const mode of required?.elicitation ?? []) {
    if (!profile.clientFeatures?.elicitation?.includes(mode)) {
      issues.push({
        severity: "incompatible",
        code: "elicitation-required",
        path: `clientRequirements.elicitation.${mode}`,
        message: `${manifest.server.name} requires ${mode} elicitation`,
      });
    }
  }

  const extensions = new Set(profile.extensions ?? []);
  for (const [extension, configuration] of Object.entries(manifest.extensions ?? {})) {
    if (extensions.has(extension)) continue;
    const requiredExtension =
      configuration && typeof configuration === "object" &&
      (configuration as Record<string, unknown>).required === true;
    issues.push({
      severity: requiredExtension ? "incompatible" : "degraded",
      code: "extension-unavailable",
      path: `extensions.${extension}`,
      message: `${profile.name} does not support ${extension}`,
    });
  }

  if (!extensions.has(MCP_APP_EXTENSION_ID)) {
    for (const tool of manifest.tools) {
      const ui = tool.metadata?.ui as { visibility?: string[] } | undefined;
      if (ui?.visibility?.length && !ui.visibility.includes("model")) {
        issues.push({
          severity: "incompatible",
          code: "app-only-tool-unavailable",
          path: `tools.${tool.name}.metadata.ui.visibility`,
          message: `${tool.name} is app-only but ${profile.name} does not support MCP Apps`,
        });
      }
    }
  }

  issues.sort((left, right) => {
    if (left.path !== right.path) return left.path < right.path ? -1 : 1;
    return left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
  });
  const status = issues.some((issue) => issue.severity === "incompatible")
    ? "incompatible"
    : issues.length
      ? "degraded"
      : "compatible";
  return { status, compatible: status !== "incompatible", issues };
}
