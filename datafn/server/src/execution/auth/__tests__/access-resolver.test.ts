import { describe, expect, it, vi } from "vitest";
import {
  canonicalizePrincipalInput,
  enforceOwnerFieldAccess,
  resolveEffectiveAccess,
  resolveEffectiveLevel,
  type AccessGrant,
} from "../access-resolver.js";
import {
  resolveEffectivePrincipals,
  type PrincipalHierarchyEdge,
  type PrincipalResolverStore,
} from "../principal-resolver.js";
import {
  createAuthResolverCache,
  onHierarchyMutation,
  onMembershipMutation,
} from "../cache.js";

function buildStore(input: {
  memberships: readonly string[];
  hierarchy: readonly PrincipalHierarchyEdge[];
}): PrincipalResolverStore {
  const hierarchyByPrincipal = new Map<string, PrincipalHierarchyEdge[]>();
  for (const edge of input.hierarchy) {
    if (!hierarchyByPrincipal.has(edge.principalId)) {
      hierarchyByPrincipal.set(edge.principalId, []);
    }
    hierarchyByPrincipal.get(edge.principalId)!.push(edge);
  }

  return {
    getDirectMemberships: vi.fn(async () => [...input.memberships]),
    getHierarchyParents: vi.fn(async ({ principalIds }) => {
      const edges: PrincipalHierarchyEdge[] = [];
      for (const principalId of principalIds) {
        edges.push(...(hierarchyByPrincipal.get(principalId) ?? []));
      }
      return edges;
    }),
  };
}

describe("principal resolver", () => {
  it("expands direct memberships using hierarchy and returns deterministic effective principals", async () => {
    const store = buildStore({
      memberships: ["project:atlas"],
      hierarchy: [{ principalId: "project:atlas", parentPrincipalId: "org:acme" }],
    });
    const cache = createAuthResolverCache();

    const first = await resolveEffectivePrincipals({
      namespace: "org:acme",
      actorId: "bob",
      store,
      cache,
      maxDepth: 8,
    });
    expect(first.effectivePrincipals).toEqual([
      "project:atlas",
      "org:acme",
      "user:bob",
    ]);
    expect((store.getDirectMemberships as any).mock.calls).toHaveLength(1);
    expect((store.getHierarchyParents as any).mock.calls).toHaveLength(2);

    const second = await resolveEffectivePrincipals({
      namespace: "org:acme",
      actorId: "bob",
      store,
      cache,
      maxDepth: 8,
    });
    expect(second.effectivePrincipals).toEqual(first.effectivePrincipals);
    expect((store.getDirectMemberships as any).mock.calls).toHaveLength(1);
    expect((store.getHierarchyParents as any).mock.calls).toHaveLength(2);

    onMembershipMutation(cache, "org:acme", "bob");
    await resolveEffectivePrincipals({
      namespace: "org:acme",
      actorId: "bob",
      store,
      cache,
      maxDepth: 8,
    });
    expect((store.getDirectMemberships as any).mock.calls).toHaveLength(2);

    onHierarchyMutation(cache, "org:acme");
    await resolveEffectivePrincipals({
      namespace: "org:acme",
      actorId: "bob",
      store,
      cache,
      maxDepth: 8,
    });
    expect((store.getHierarchyParents as any).mock.calls.length).toBeGreaterThan(2);
  });

  it("throws deterministic cycle error", async () => {
    const store = buildStore({
      memberships: ["team:a"],
      hierarchy: [
        { principalId: "team:a", parentPrincipalId: "team:b" },
        { principalId: "team:b", parentPrincipalId: "team:a" },
      ],
    });

    await expect(
      resolveEffectivePrincipals({
        namespace: "org:acme",
        actorId: "bob",
        store,
        maxDepth: 8,
      }),
    ).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: "Principal hierarchy cycle detected",
      details: { path: "__datafn_principal_hierarchy" },
    });
  });

  it("enforces maxDepth guard", async () => {
    const store = buildStore({
      memberships: ["team:a"],
      hierarchy: [
        { principalId: "team:a", parentPrincipalId: "team:b" },
        { principalId: "team:b", parentPrincipalId: "team:c" },
      ],
    });

    await expect(
      resolveEffectivePrincipals({
        namespace: "org:acme",
        actorId: "bob",
        store,
        maxDepth: 1,
      }),
    ).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: "Principal hierarchy maxDepth exceeded",
      details: { path: "__datafn_principal_hierarchy", maxDepth: 1 },
    });
  });
});

describe("access resolver", () => {
  it("reduces effectiveLevel across record, scope, and inherited grants with owner precedence", () => {
    const grants: AccessGrant[] = [
      {
        principalId: "org:acme",
        level: "viewer",
        grantKind: "record",
        resourceId: "obj_1",
      },
      {
        principalId: "project:atlas",
        level: "editor",
        grantKind: "scope",
        resourceId: null,
      },
      {
        principalId: "user:bob",
        level: "owner",
        grantKind: "relation_inherited",
        resourceId: "obj_1",
        sourceRef: "collections:col_1",
      },
    ];

    const effective = resolveEffectiveLevel({
      resourceId: "obj_1",
      effectivePrincipals: ["project:atlas", "org:acme", "user:bob"],
      grants,
    });

    expect(effective.effectiveLevel).toBe("owner");
    expect(effective.matchedGrants).toHaveLength(3);
  });

  it("treats principal identifiers as opaque strings and canonicalizes legacy userId", () => {
    expect(canonicalizePrincipalInput({ principalId: "team:engineering" })).toEqual({
      ok: true,
      principalId: "team:engineering",
      source: "principalId",
    });
    expect(canonicalizePrincipalInput({ userId: "bob" })).toEqual({
      ok: true,
      principalId: "user:bob",
      source: "userId",
    });
    expect(canonicalizePrincipalInput({ principalId: "" })).toEqual({
      ok: false,
      code: "DFQL_PRINCIPAL_INVALID",
      message: "principalId must be non-empty string",
      path: "shareWith.principalId",
    });
  });

  it("enforces ownerField for write authz and raises clear misconfiguration errors", () => {
    const ownerAllowed = enforceOwnerFieldAccess({
      ownerField: "ownerId",
      record: { id: "obj_1", ownerId: "alice" },
      actorId: "alice",
      mode: "write",
    });
    expect(ownerAllowed).toEqual({
      ok: true,
      enforced: true,
      ownerMatched: true,
    });

    const denied = enforceOwnerFieldAccess({
      ownerField: "ownerId",
      record: { id: "obj_1", ownerId: "alice" },
      actorId: "bob",
      mode: "write",
    });
    expect(denied).toEqual({
      ok: false,
      code: "FORBIDDEN",
      message: "Authorization denied",
      path: "operation",
    });

    const misconfigured = enforceOwnerFieldAccess({
      ownerField: "ownerId",
      record: { id: "obj_1" },
      actorId: "alice",
      mode: "read",
    });
    expect(misconfigured).toEqual({
      ok: false,
      code: "DFQL_INVALID",
      message: 'ownerField "ownerId" is not present on record',
      path: "record.ownerId",
    });
  });

  it("returns owner effectiveLevel when ownerField matches", () => {
    const result = resolveEffectiveAccess({
      mode: "write",
      actorId: "alice",
      ownerField: "ownerId",
      record: { id: "obj_1", ownerId: "alice" },
      resourceId: "obj_1",
      effectivePrincipals: ["user:alice"],
      grants: [],
    });
    expect(result).toEqual({
      ok: true,
      effectiveLevel: "owner",
      matchedGrants: [],
      ownerMatched: true,
    });
  });
});
