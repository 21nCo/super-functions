import { canonicalizeActorPrincipal } from "./principal-resolver.js";

export type AccessLevel = "viewer" | "editor" | "owner";
export type AccessMode = "read" | "write";
export type AccessGrantKind = "record" | "scope" | "relation_inherited";

export type AccessGrant = {
  principalId: string;
  level: AccessLevel;
  grantKind: AccessGrantKind;
  resourceId: string | null;
  sourceRef?: string | null;
};

export type PrincipalInput = {
  principalId?: unknown;
  userId?: unknown;
};

export type PrincipalCanonicalizationResult =
  | { ok: true; principalId: string; source: "principalId" | "userId" }
  | {
      ok: false;
      code: "DFQL_PRINCIPAL_INVALID";
      message: string;
      path: "shareWith.principalId";
    };

export type OwnerFieldCheckResult =
  | { ok: true; enforced: false; ownerMatched: false }
  | { ok: true; enforced: true; ownerMatched: boolean }
  | { ok: false; code: "DFQL_INVALID" | "FORBIDDEN"; message: string; path: string };

export type EffectiveLevelResult = {
  effectiveLevel: AccessLevel | null;
  matchedGrants: AccessGrant[];
};

const LEVEL_WEIGHT: Record<AccessLevel, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

function normalizePrincipal(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLevel(value: unknown): AccessLevel | null {
  if (value === "viewer" || value === "editor" || value === "owner") {
    return value;
  }
  return null;
}

function canonicalizePrincipalFromUserId(userId: string): string {
  return userId.includes(":") ? userId : `user:${userId}`;
}

function ownerMatchesActor(ownerValue: string, actorId: string): boolean {
  const actorPrincipal = canonicalizeActorPrincipal(actorId);
  if (ownerValue === actorId || ownerValue === actorPrincipal) {
    return true;
  }
  const ownerPrincipal = canonicalizePrincipalFromUserId(ownerValue);
  return ownerPrincipal === actorPrincipal;
}

export function canonicalizePrincipalInput(
  input: PrincipalInput,
): PrincipalCanonicalizationResult {
  const principalId = normalizePrincipal(input.principalId);
  if (principalId) {
    return { ok: true, principalId, source: "principalId" };
  }

  const userId = normalizePrincipal(input.userId);
  if (userId) {
    return {
      ok: true,
      principalId: canonicalizePrincipalFromUserId(userId),
      source: "userId",
    };
  }

  return {
    ok: false,
    code: "DFQL_PRINCIPAL_INVALID",
    message: "principalId must be non-empty string",
    path: "shareWith.principalId",
  };
}

export function resolveEffectiveLevel(input: {
  resourceId: string;
  effectivePrincipals: readonly string[];
  grants: readonly AccessGrant[];
}): EffectiveLevelResult {
  const principalSet = new Set(
    input.effectivePrincipals
      .map(normalizePrincipal)
      .filter((value): value is string => value !== null),
  );

  let effectiveLevel: AccessLevel | null = null;
  const matchedGrants: AccessGrant[] = [];

  for (const grant of input.grants) {
    const principalId = normalizePrincipal(grant.principalId);
    const level = normalizeLevel(grant.level);
    if (!principalId || !level) {
      continue;
    }
    if (!principalSet.has(principalId)) {
      continue;
    }
    if (grant.grantKind === "scope") {
      if (grant.resourceId !== null) {
        continue;
      }
    } else if (grant.resourceId !== input.resourceId) {
      continue;
    }

    matchedGrants.push({
      ...grant,
      principalId,
      level,
    });

    if (!effectiveLevel || LEVEL_WEIGHT[level] > LEVEL_WEIGHT[effectiveLevel]) {
      effectiveLevel = level;
    }
  }

  return { effectiveLevel, matchedGrants };
}

export function enforceOwnerFieldAccess(input: {
  ownerField?: string;
  record: Record<string, unknown> | null | undefined;
  actorId: string | undefined;
  mode: AccessMode;
}): OwnerFieldCheckResult {
  if (input.ownerField === undefined) {
    return { ok: true, enforced: false, ownerMatched: false };
  }

  const ownerField = normalizePrincipal(input.ownerField);
  if (!ownerField) {
    return {
      ok: false,
      code: "DFQL_INVALID",
      message: "ownerField must be a non-empty string",
      path: "permissions.ownerField",
    };
  }

  if (!input.record || typeof input.record !== "object" || Array.isArray(input.record)) {
    return {
      ok: false,
      code: "DFQL_INVALID",
      message: `ownerField "${ownerField}" requires a record object`,
      path: "record",
    };
  }

  if (!(ownerField in input.record)) {
    return {
      ok: false,
      code: "DFQL_INVALID",
      message: `ownerField "${ownerField}" is not present on record`,
      path: `record.${ownerField}`,
    };
  }

  const ownerValue = normalizePrincipal(input.record[ownerField]);
  if (!ownerValue) {
    return {
      ok: false,
      code: "DFQL_INVALID",
      message: `ownerField "${ownerField}" must contain a non-empty string`,
      path: `record.${ownerField}`,
    };
  }

  if (!input.actorId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Authorization denied",
      path: input.mode === "read" ? "resource" : "operation",
    };
  }

  if (!ownerMatchesActor(ownerValue, input.actorId)) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Authorization denied",
      path: input.mode === "read" ? "resource" : "operation",
    };
  }

  return { ok: true, enforced: true, ownerMatched: true };
}

export function resolveEffectiveAccess(input: {
  mode: AccessMode;
  actorId: string | undefined;
  ownerField?: string;
  record?: Record<string, unknown> | null;
  resourceId: string;
  effectivePrincipals: readonly string[];
  grants: readonly AccessGrant[];
}):
  | {
      ok: true;
      effectiveLevel: AccessLevel | null;
      matchedGrants: AccessGrant[];
      ownerMatched: boolean;
    }
  | { ok: false; code: "DFQL_INVALID" | "FORBIDDEN"; message: string; path: string } {
  const ownerResult = enforceOwnerFieldAccess({
    ownerField: input.ownerField,
    record: input.record,
    actorId: input.actorId,
    mode: input.mode,
  });
  if (!ownerResult.ok) {
    return ownerResult;
  }

  const levelResult = resolveEffectiveLevel({
    resourceId: input.resourceId,
    effectivePrincipals: input.effectivePrincipals,
    grants: input.grants,
  });

  const ownerLevel: AccessLevel | null = ownerResult.ownerMatched ? "owner" : null;
  const effectiveLevel =
    ownerLevel && (!levelResult.effectiveLevel || LEVEL_WEIGHT[ownerLevel] >= LEVEL_WEIGHT[levelResult.effectiveLevel])
      ? ownerLevel
      : levelResult.effectiveLevel;

  return {
    ok: true,
    effectiveLevel,
    matchedGrants: levelResult.matchedGrants,
    ownerMatched: ownerResult.ownerMatched,
  };
}
