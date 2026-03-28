import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";

const NAMESPACE = "org:acme";

const schema = {
  resources: [
    {
      name: "collections",
      version: 1,
      capabilities: [
        "timestamps",
        "audit",
        {
          shareable: {
            levels: ["viewer", "editor", "owner"],
            default: "private",
            relationInheritance: {
              enabled: true,
              relations: ["items"],
              requireRelateConsent: true,
            },
          },
        },
      ],
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
    {
      name: "notes",
      version: 1,
      capabilities: [
        "timestamps",
        "audit",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ],
      fields: [
        { name: "title", type: "string" as const, required: true },
        { name: "collectionId", type: "string" as const, required: false, nullable: true },
      ],
    },
  ],
  relations: [
    {
      from: "collections",
      to: "notes",
      type: "one-many",
      relation: "items",
      inverse: "collection",
      fkField: "collectionId",
    },
  ],
};

type UseCasePattern = {
  namespace: string;
  visibility: string;
  grantType: string;
  syncBehavior: string;
};

const CANONICAL_USE_CASE_MATRIX: Record<string, UseCasePattern> = {
  Collections: {
    namespace: "user:<id> or org:<id>",
    visibility: "private/shared (tri-state compatible)",
    grantType: "record + scope + relation_inherited",
    syncBehavior: "revoke tombstone + grant backfill",
  },
  Memotron: {
    namespace: "user:<id>",
    visibility: "private with selective shares",
    grantType: "record + relation_inherited",
    syncBehavior: "actor feed + deterministic pull apply",
  },
  Selftron: {
    namespace: "user:<id>",
    visibility: "private default",
    grantType: "record",
    syncBehavior: "offline pull visibility-filtered",
  },
  Pointron: {
    namespace: "org:<id>",
    visibility: "shared + scoped team views",
    grantType: "scope + record",
    syncBehavior: "cursor-monotonic sync",
  },
  Finatron: {
    namespace: "org:<id>",
    visibility: "private with explicit principal grants",
    grantType: "record + scope + relation_inherited",
    syncBehavior: "revoke-first deterministic deletes",
  },
  Feedtron: {
    namespace: "org:<id>",
    visibility: "mixed namespace/sharedWithMe mode",
    grantType: "scope + record",
    syncBehavior: "actor feed for membership + hierarchy",
  },
  Compoundum: {
    namespace: "org:<id>",
    visibility: "private/shared by workspace",
    grantType: "record + relation_inherited",
    syncBehavior: "backfill on new grants + idempotent apply",
  },
};

function validateUseCaseMatrix(domains: string[], matrix: Record<string, UseCasePattern>) {
  for (const domain of domains) {
    const pattern = matrix[domain];
    if (!pattern) {
      return {
        ok: false as const,
        error: {
          code: "INTERNAL",
          message: "Use-case mapping incomplete",
          details: { path: `domains.${domain}` },
        },
      };
    }
    if (
      !pattern.namespace ||
      !pattern.visibility ||
      !pattern.grantType ||
      !pattern.syncBehavior
    ) {
      return {
        ok: false as const,
        error: {
          code: "INTERNAL",
          message: "Use-case mapping incomplete",
          details: { path: `domains.${domain}` },
        },
      };
    }
  }
  return { ok: true as const, result: { allDomainsMapped: true } };
}

async function callEndpoint(
  server: any,
  path: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const req = new Request(`http://localhost/datafn/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = await server.router.handle(req, {});
  const body = await res.json();
  return { status: res.status, body };
}

describe("relation inheritance query semantics", () => {
  let db: any;
  let server: any;
  let actorId: string | undefined;

  beforeEach(async () => {
    actorId = "alice";
    db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      db,
      namespaceProvider: {
        getNamespace: () => NAMESPACE,
        getActorId: () => actorId as any,
      },
    });
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("REL-001: getPermissions includes relation_inherited grantKind with inheritance sourceRef", async () => {
    await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "insert",
      clientId: "c-relq",
      mutationId: "m-relq-col",
      id: "col_1",
      record: { title: "Parent" },
    });
    await callEndpoint(server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-relq",
      mutationId: "m-relq-note",
      id: "note_1",
      record: { title: "Child", collectionId: "col_1" },
    });
    await callEndpoint(server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "share",
      clientId: "c-relq",
      mutationId: "m-relq-share",
      id: "col_1",
      shareWith: { principalId: "user:bob", level: "viewer" },
    });

    actorId = "alice";
    const permissions = await callEndpoint(server, "query", {
      resource: "notes",
      version: 1,
      operation: "getPermissions",
      id: "note_1",
    });
    expect(permissions.status).toBe(200);
    expect(permissions.body.ok).toBe(true);
    expect(permissions.body.result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalId: "user:bob",
          grantKind: "relation_inherited",
          sourceRef: "collections:col_1:items",
        }),
      ]),
    );
  });

  it("TV-USE-001-P/N: canonical use-case matrix covers all listed domains with required mapping fields", async () => {
    const allDomains = [
      "Collections",
      "Memotron",
      "Selftron",
      "Pointron",
      "Finatron",
      "Feedtron",
      "Compoundum",
    ];

    const positive = validateUseCaseMatrix(allDomains, CANONICAL_USE_CASE_MATRIX);
    expect(positive).toEqual({
      ok: true,
      result: { allDomainsMapped: true },
    });

    const missingFinatron = { ...CANONICAL_USE_CASE_MATRIX };
    delete missingFinatron.Finatron;
    const negative = validateUseCaseMatrix(allDomains, missingFinatron);
    expect(negative).toEqual({
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Use-case mapping incomplete",
        details: { path: "domains.Finatron" },
      },
    });
  });
});

