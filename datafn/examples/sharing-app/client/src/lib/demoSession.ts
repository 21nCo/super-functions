import { get, writable } from "svelte/store";
import {
  fetchDemoBootstrap,
  type DemoBootstrapResult,
  type DemoIdentity,
  type DemoUserId,
  type DemoWorkspace,
  type DemoWorkspaceId,
} from "./api";

export type DemoSession = {
  workspaceId: DemoWorkspaceId;
  userId: DemoUserId;
  localNamespace: string;
};

const FALLBACK_WORKSPACE_ID: DemoWorkspaceId = "acme";
const FALLBACK_USER_ID: DemoUserId = "user:alice";

export function toLocalNamespace(identity: DemoIdentity): string {
  return `demo:${identity.workspaceId}:${identity.userId}`;
}

function buildSession(identity: DemoIdentity): DemoSession {
  return {
    workspaceId: identity.workspaceId,
    userId: identity.userId,
    localNamespace: toLocalNamespace(identity),
  };
}

export const demoBootstrap = writable<DemoBootstrapResult | null>(null);
export const demoSession = writable<DemoSession>(
  buildSession({
    workspaceId: FALLBACK_WORKSPACE_ID,
    userId: FALLBACK_USER_ID,
  }),
);

function getWorkspaceById(
  workspaceId: DemoWorkspaceId,
): DemoWorkspace | undefined {
  return get(demoBootstrap)?.workspaces.find((workspace) => workspace.id === workspaceId);
}

function isUserAllowedInWorkspace(
  workspaceId: DemoWorkspaceId,
  userId: DemoUserId,
): boolean {
  const workspace = getWorkspaceById(workspaceId);
  return !!workspace && workspace.users.includes(userId);
}

function normalizeIdentity(identity: DemoIdentity): DemoIdentity {
  if (isUserAllowedInWorkspace(identity.workspaceId, identity.userId)) {
    return identity;
  }

  const fallbackWorkspace =
    getWorkspaceById(identity.workspaceId) ?? get(demoBootstrap)?.workspaces[0];

  if (!fallbackWorkspace) {
    return {
      workspaceId: FALLBACK_WORKSPACE_ID,
      userId: FALLBACK_USER_ID,
    };
  }

  return {
    workspaceId: fallbackWorkspace.id,
    userId: fallbackWorkspace.users[0] ?? FALLBACK_USER_ID,
  };
}

function setIdentity(identity: DemoIdentity) {
  const normalized = normalizeIdentity(identity);
  demoSession.set(buildSession(normalized));
}

export async function initializeDemoSession() {
  const bootstrap = await fetchDemoBootstrap();
  demoBootstrap.set(bootstrap);

  setIdentity({
    workspaceId: bootstrap.defaultWorkspaceId,
    userId: bootstrap.defaultUserId,
  });

  return bootstrap;
}

export function setWorkspaceId(workspaceId: DemoWorkspaceId) {
  const current = get(demoSession);
  const workspace = getWorkspaceById(workspaceId);
  if (!workspace) return;

  const nextUserId = workspace.users.includes(current.userId)
    ? current.userId
    : workspace.users[0] ?? FALLBACK_USER_ID;

  setIdentity({
    workspaceId,
    userId: nextUserId,
  });
}

export function setUserId(userId: DemoUserId) {
  const current = get(demoSession);
  if (!isUserAllowedInWorkspace(current.workspaceId, userId)) return;

  setIdentity({
    workspaceId: current.workspaceId,
    userId,
  });
}

export function getDemoIdentity(): DemoIdentity {
  const current = get(demoSession);
  return {
    workspaceId: current.workspaceId,
    userId: current.userId,
  };
}
