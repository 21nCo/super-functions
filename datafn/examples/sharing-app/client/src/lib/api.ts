export const DEMO_SERVER_ORIGIN =
  import.meta.env.VITE_DEMO_SERVER_ORIGIN ?? "http://127.0.0.1:3001";

export type DemoUserId = "user:alice" | "user:bob" | "user:charlie";
export type DemoWorkspaceId = "acme" | "globex";
export const DEMO_USERS: DemoUserId[] = ["user:alice", "user:bob", "user:charlie"];

export type DemoWorkspace = {
  id: DemoWorkspaceId;
  label?: string;
  namespace: string;
  users: DemoUserId[];
  principals?: string[];
};

export type DemoBootstrapResult = {
  defaultWorkspaceId: DemoWorkspaceId;
  defaultUserId: DemoUserId;
  workspaces: DemoWorkspace[];
};

export type DemoIdentity = {
  workspaceId: DemoWorkspaceId;
  userId: DemoUserId;
};

export type DemoContextResult = {
  workspaceId: DemoWorkspaceId;
  namespace: string;
  actorId: DemoUserId;
  effectivePrincipals: string[];
};

export type DemoResetResult = {
  scenario: "baseline";
  documentCounts: Record<string, number>;
  membershipCounts: Record<string, number>;
};

type DemoSuccess<T> = {
  ok: true;
  result: T;
};

type DemoFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export function getDemoHeaders(identity: DemoIdentity): Record<string, string> {
  return {
    "x-demo-workspace-id": identity.workspaceId,
    "x-demo-user-id": identity.userId,
  };
}

async function requestDemo<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${DEMO_SERVER_ORIGIN}${path}`, init);
  const payload = (await response.json()) as DemoSuccess<T> | DemoFailure;

  if (!response.ok || payload.ok === false) {
    throw payload;
  }

  return payload.result;
}

export async function fetchDemoBootstrap(): Promise<DemoBootstrapResult> {
  return requestDemo<DemoBootstrapResult>("/demo/bootstrap", {
    method: "GET",
  });
}

export async function fetchDemoContext(
  identity: DemoIdentity,
): Promise<DemoContextResult> {
  return requestDemo<DemoContextResult>("/demo/context", {
    method: "GET",
    headers: {
      ...getDemoHeaders(identity),
    },
  });
}

export async function resetDemoBaseline(): Promise<DemoResetResult> {
  return requestDemo<DemoResetResult>("/demo/reset", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ scenario: "baseline" }),
  });
}

export function readErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof (error as { error: unknown }).error === "object" &&
    (error as { error: { code?: unknown } }).error &&
    typeof (error as { error: { code?: unknown } }).error.code === "string"
  ) {
    return (error as { error: { code: string } }).error.code;
  }

  return "UNKNOWN_ERROR";
}
