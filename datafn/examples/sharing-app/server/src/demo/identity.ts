import { AsyncLocalStorage } from "node:async_hooks";

export const DEMO_WORKSPACE_HEADER = "x-demo-workspace-id";
export const DEMO_USER_HEADER = "x-demo-user-id";

export const DEMO_USERS = ["user:alice", "user:bob", "user:charlie"] as const;
export type DemoUserId = (typeof DEMO_USERS)[number];

export const DEMO_WORKSPACES = [
  {
    id: "acme",
    namespace: "org:acme",
    users: [...DEMO_USERS],
  },
  {
    id: "globex",
    namespace: "org:globex",
    users: [...DEMO_USERS],
  },
] as const;

export type DemoWorkspaceId = (typeof DEMO_WORKSPACES)[number]["id"];

export type DemoIdentity = {
  workspaceId: DemoWorkspaceId;
  userId: DemoUserId;
  namespace: string;
  actorId: DemoUserId;
};

export type DemoIdentityErrorEnvelope = {
  ok: false;
  error: {
    code: "DEMO_IDENTITY_INVALID";
    message: "Invalid demo identity";
    details?: {
      header: string;
    };
  };
};

type DemoIdentityParseResult =
  | { ok: true; result: DemoIdentity }
  | { ok: false; error: DemoIdentityErrorEnvelope };

const WORKSPACE_BY_ID = new Map(
  DEMO_WORKSPACES.map((workspace) => [workspace.id, workspace]),
);
const USER_SET = new Set<string>(DEMO_USERS);

const identityStore = new AsyncLocalStorage<DemoIdentity>();

export function demoIdentityError(header?: string): DemoIdentityErrorEnvelope {
  return {
    ok: false,
    error: {
      code: "DEMO_IDENTITY_INVALID",
      message: "Invalid demo identity",
      ...(header ? { details: { header } } : {}),
    },
  };
}

export function parseDemoIdentityFromHeaders(
  headers: Headers,
): DemoIdentityParseResult {
  const workspaceIdRaw = headers.get(DEMO_WORKSPACE_HEADER)?.trim() ?? "";
  const workspace = WORKSPACE_BY_ID.get(workspaceIdRaw as DemoWorkspaceId);
  if (!workspace) {
    return {
      ok: false,
      error: demoIdentityError(DEMO_WORKSPACE_HEADER),
    };
  }

  const userIdRaw = headers.get(DEMO_USER_HEADER)?.trim() ?? "";
  if (!USER_SET.has(userIdRaw)) {
    return {
      ok: false,
      error: demoIdentityError(DEMO_USER_HEADER),
    };
  }

  if (!workspace.users.includes(userIdRaw as DemoUserId)) {
    return {
      ok: false,
      error: demoIdentityError(DEMO_USER_HEADER),
    };
  }

  return {
    ok: true,
    result: {
      workspaceId: workspace.id,
      userId: userIdRaw as DemoUserId,
      namespace: workspace.namespace,
      actorId: userIdRaw as DemoUserId,
    },
  };
}

export function runWithDemoIdentity<T>(
  identity: DemoIdentity,
  callback: () => T,
): T {
  return identityStore.run(identity, callback);
}

export function getCurrentDemoIdentity(): DemoIdentity | null {
  return identityStore.getStore() ?? null;
}

export function requireCurrentDemoIdentity(): DemoIdentity {
  const identity = getCurrentDemoIdentity();
  if (!identity) {
    throw new Error("Missing demo identity context");
  }
  return identity;
}
