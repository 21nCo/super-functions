import { AdminError } from "./errors.js";
import type {
  AdminCapabilityManifest,
  AdminOperationDefinition,
  AdminScope,
  AdminScopeLevel,
} from "./types.js";

export type CanonicalAdminScopeLevel = "installation" | "workspace" | "project" | "environment";

const ORDER: readonly CanonicalAdminScopeLevel[] = [
  "installation",
  "workspace",
  "project",
  "environment",
];

export function canonicalAdminScopeLevel(level: AdminScopeLevel): CanonicalAdminScopeLevel {
  return level === "organization" ? "installation" : level;
}

export function adminScopeLevelRank(level: AdminScopeLevel): number {
  return ORDER.indexOf(canonicalAdminScopeLevel(level));
}

export function adminScopeRootId(scope: AdminScope): string | undefined {
  return scope.installationId ?? scope.organizationId;
}

export function canonicalAdminScope(scope: AdminScope): AdminScope {
  const { organizationId: _organizationId, ...canonical } = scope;
  const installationId = adminScopeRootId(scope);
  return {
    ...canonical,
    ...(installationId === undefined ? {} : { installationId }),
  };
}

export function adminScopeId(scope: AdminScope, level: AdminScopeLevel): string | undefined {
  switch (canonicalAdminScopeLevel(level)) {
    case "installation": return adminScopeRootId(scope);
    case "workspace": return scope.workspaceId;
    case "project": return scope.projectId;
    case "environment": return scope.environmentId;
  }
}

/** Returns every structural issue without consulting tenant membership data. */
export function validateAdminScopeHierarchy(scope: AdminScope): string[] {
  const issues: string[] = [];
  const values = ORDER.map((level) => adminScopeId(scope, level));
  if (scope.installationId && scope.organizationId && scope.installationId !== scope.organizationId) {
    issues.push("installationId and the deprecated organizationId alias must identify the same installation");
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== undefined && (typeof value !== "string" || !value.trim())) {
      issues.push(`${ORDER[index]}Id must be a nonblank string when supplied`);
    }
    if (value?.trim() && index > 0 && !values[index - 1]?.trim()) {
      issues.push(`${ORDER[index]}Id requires ${ORDER[index - 1]}Id`);
    }
  }
  return issues;
}

export function assertAdminScopeHierarchy(scope: AdminScope): void {
  const issues = validateAdminScopeHierarchy(scope);
  if (issues.length) {
    throw new AdminError("invalid_argument", "The administration scope hierarchy is invalid.", {
      details: { issues },
    });
  }
}

export function assertAdminScopeMinimum(scope: AdminScope, minimum: AdminScopeLevel): void {
  assertAdminScopeHierarchy(scope);
  const canonical = canonicalAdminScopeLevel(minimum);
  const minimumRank = adminScopeLevelRank(canonical);
  for (let index = 0; index <= minimumRank; index += 1) {
    if (!adminScopeId(scope, ORDER[index]!)) {
      throw new AdminError(
        "forbidden",
        `The operation requires an active ${canonical} scope.`,
        { details: { minimumScope: canonical } },
      );
    }
  }
}

export function adminOperationMinimumScope(
  manifest: AdminCapabilityManifest,
  operation: AdminOperationDefinition,
): CanonicalAdminScopeLevel {
  const resource = manifest.resources?.find((candidate) => candidate.id === operation.target.resource);
  const explicit = operation.minimumScope ?? resource?.minimumScope;
  if (explicit) return canonicalAdminScopeLevel(explicit);
  // Compatibility: manifests created before minimumScope inherit their deepest
  // declared level, preserving their previous full-scope behavior.
  return manifest.scopeLevels
    .map(canonicalAdminScopeLevel)
    .reduce((deepest, candidate) =>
      adminScopeLevelRank(candidate) > adminScopeLevelRank(deepest) ? candidate : deepest,
    "installation" as CanonicalAdminScopeLevel);
}

export function adminScopeSupportsOperation(
  scope: AdminScope,
  manifest: AdminCapabilityManifest,
  operation: AdminOperationDefinition,
): boolean {
  try {
    assertAdminScopeMinimum(scope, adminOperationMinimumScope(manifest, operation));
    return true;
  } catch {
    return false;
  }
}
