export type CachedPrincipalResolution = {
  actorId: string;
  maxDepth: number;
  hierarchyRevision: number;
  membershipRevision: number;
  actorMembershipRevision: number;
  principals: readonly string[];
};

type NamespaceCacheState = {
  hierarchyRevision: number;
  membershipRevision: number;
  actorMembershipRevision: Map<string, number>;
  parentsByPrincipal: Map<string, readonly string[]>;
  resolvedByActor: Map<string, CachedPrincipalResolution>;
};

function createNamespaceState(): NamespaceCacheState {
  return {
    hierarchyRevision: 0,
    membershipRevision: 0,
    actorMembershipRevision: new Map<string, number>(),
    parentsByPrincipal: new Map<string, readonly string[]>(),
    resolvedByActor: new Map<string, CachedPrincipalResolution>(),
  };
}

export class AuthResolverCache {
  private readonly namespaces = new Map<string, NamespaceCacheState>();

  private getState(namespace: string): NamespaceCacheState {
    let state = this.namespaces.get(namespace);
    if (!state) {
      state = createNamespaceState();
      this.namespaces.set(namespace, state);
    }
    return state;
  }

  getHierarchyParents(namespace: string, principalId: string): readonly string[] | undefined {
    return this.getState(namespace).parentsByPrincipal.get(principalId);
  }

  setHierarchyParents(namespace: string, principalId: string, parentPrincipalIds: readonly string[]): void {
    this.getState(namespace).parentsByPrincipal.set(principalId, parentPrincipalIds);
  }

  getResolvedPrincipals(
    namespace: string,
    actorId: string,
    maxDepth: number,
  ): readonly string[] | undefined {
    const state = this.getState(namespace);
    const cached = state.resolvedByActor.get(actorId);
    if (!cached) {
      return undefined;
    }
    const actorMembershipRevision = state.actorMembershipRevision.get(actorId) ?? 0;
    const isFresh =
      cached.maxDepth === maxDepth &&
      cached.hierarchyRevision === state.hierarchyRevision &&
      cached.membershipRevision === state.membershipRevision &&
      cached.actorMembershipRevision === actorMembershipRevision;
    return isFresh ? cached.principals : undefined;
  }

  setResolvedPrincipals(
    namespace: string,
    actorId: string,
    maxDepth: number,
    principals: readonly string[],
  ): void {
    const state = this.getState(namespace);
    state.resolvedByActor.set(actorId, {
      actorId,
      maxDepth,
      principals,
      hierarchyRevision: state.hierarchyRevision,
      membershipRevision: state.membershipRevision,
      actorMembershipRevision: state.actorMembershipRevision.get(actorId) ?? 0,
    });
  }

  invalidateHierarchy(namespace: string): void {
    const state = this.getState(namespace);
    state.hierarchyRevision += 1;
    state.parentsByPrincipal.clear();
    state.resolvedByActor.clear();
  }

  invalidateMembership(namespace: string, actorId?: string): void {
    const state = this.getState(namespace);
    if (actorId) {
      state.actorMembershipRevision.set(
        actorId,
        (state.actorMembershipRevision.get(actorId) ?? 0) + 1,
      );
      state.resolvedByActor.delete(actorId);
      return;
    }
    state.membershipRevision += 1;
    state.actorMembershipRevision.clear();
    state.resolvedByActor.clear();
  }
}

export function createAuthResolverCache(): AuthResolverCache {
  return new AuthResolverCache();
}

export function onHierarchyMutation(cache: AuthResolverCache, namespace: string): void {
  cache.invalidateHierarchy(namespace);
}

export function onMembershipMutation(
  cache: AuthResolverCache,
  namespace: string,
  actorId?: string,
): void {
  cache.invalidateMembership(namespace, actorId);
}
