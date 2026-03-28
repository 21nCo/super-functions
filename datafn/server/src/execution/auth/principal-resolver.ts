import { DatafnExecutionError } from "../errors.js";
import type { AuthResolverCache } from "./cache.js";

export type PrincipalHierarchyEdge = {
  principalId: string;
  parentPrincipalId: string;
};

export type PrincipalResolverStore = {
  getDirectMemberships(input: { namespace: string; actorId: string }): Promise<string[]>;
  getHierarchyParents(input: {
    namespace: string;
    principalIds: readonly string[];
  }): Promise<readonly PrincipalHierarchyEdge[]>;
};

export type ResolveEffectivePrincipalsInput = {
  namespace: string;
  actorId: string;
  store: PrincipalResolverStore;
  cache?: AuthResolverCache;
  maxDepth?: number;
};

export type ResolveEffectivePrincipalsResult = {
  effectivePrincipals: string[];
};

const DEFAULT_MAX_DEPTH = 16;

function normalizePrincipal(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function canonicalizeActorPrincipal(actorId: string): string {
  const normalized = normalizePrincipal(actorId);
  if (!normalized) {
    return "user:";
  }
  return normalized.includes(":") ? normalized : `user:${normalized}`;
}

async function loadParents(
  namespace: string,
  principalIds: readonly string[],
  store: PrincipalResolverStore,
  cache?: AuthResolverCache,
): Promise<Map<string, readonly string[]>> {
  const out = new Map<string, readonly string[]>();
  const uncached: string[] = [];

  for (const principalId of principalIds) {
    const cached = cache?.getHierarchyParents(namespace, principalId);
    if (cached) {
      out.set(principalId, cached);
    } else {
      uncached.push(principalId);
    }
  }

  if (uncached.length === 0) {
    return out;
  }

  const edges = await store.getHierarchyParents({ namespace, principalIds: uncached });
  const grouped = new Map<string, Set<string>>();
  for (const edge of edges) {
    const principalId = normalizePrincipal(edge.principalId);
    const parentPrincipalId = normalizePrincipal(edge.parentPrincipalId);
    if (!principalId || !parentPrincipalId || !uncached.includes(principalId)) {
      continue;
    }
    if (!grouped.has(principalId)) {
      grouped.set(principalId, new Set<string>());
    }
    grouped.get(principalId)!.add(parentPrincipalId);
  }

  for (const principalId of uncached) {
    const parents = uniqueSorted(grouped.get(principalId) ?? []);
    cache?.setHierarchyParents(namespace, principalId, parents);
    out.set(principalId, parents);
  }

  return out;
}

export async function resolveEffectivePrincipals(
  input: ResolveEffectivePrincipalsInput,
): Promise<ResolveEffectivePrincipalsResult> {
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (maxDepth < 1) {
    throw new DatafnExecutionError(
      "DFQL_INVALID",
      "maxDepth must be a positive integer",
      "maxDepth",
    );
  }

  const cached = input.cache?.getResolvedPrincipals(input.namespace, input.actorId, maxDepth);
  if (cached) {
    return { effectivePrincipals: [...cached] };
  }

  const directMembershipsRaw = await input.store.getDirectMemberships({
    namespace: input.namespace,
    actorId: input.actorId,
  });
  const directMemberships = uniqueSorted(
    directMembershipsRaw
      .map(normalizePrincipal)
      .filter((value): value is string => value !== null),
  );

  const effectiveSet = new Set<string>(directMemberships);
  const effectivePrincipals = [...directMemberships];
  const expanded = new Set<string>();
  const expanding = new Set<string>();

  const walk = async (principalId: string, depth: number): Promise<void> => {
    if (depth > maxDepth) {
      throw new DatafnExecutionError(
        "DFQL_INVALID",
        "Principal hierarchy maxDepth exceeded",
        "__datafn_principal_hierarchy",
        { maxDepth, principalId },
      );
    }
    if (expanded.has(principalId)) {
      return;
    }
    if (expanding.has(principalId)) {
      throw new DatafnExecutionError(
        "DFQL_INVALID",
        "Principal hierarchy cycle detected",
        "__datafn_principal_hierarchy",
      );
    }
    expanding.add(principalId);
    const parentMap = await loadParents(
      input.namespace,
      [principalId],
      input.store,
      input.cache,
    );
    const parents = parentMap.get(principalId) ?? [];
    for (const parentPrincipalId of parents) {
      if (expanding.has(parentPrincipalId)) {
        throw new DatafnExecutionError(
          "DFQL_INVALID",
          "Principal hierarchy cycle detected",
          "__datafn_principal_hierarchy",
        );
      }
      if (!effectiveSet.has(parentPrincipalId)) {
        effectiveSet.add(parentPrincipalId);
        effectivePrincipals.push(parentPrincipalId);
      }
      await walk(parentPrincipalId, depth + 1);
    }
    expanding.delete(principalId);
    expanded.add(principalId);
  };

  for (const principalId of directMemberships) {
    await walk(principalId, 1);
  }

  const actorPrincipal = canonicalizeActorPrincipal(input.actorId);
  if (!effectiveSet.has(actorPrincipal)) {
    effectivePrincipals.push(actorPrincipal);
  }

  input.cache?.setResolvedPrincipals(
    input.namespace,
    input.actorId,
    maxDepth,
    effectivePrincipals,
  );

  return { effectivePrincipals };
}
