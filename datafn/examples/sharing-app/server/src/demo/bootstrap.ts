import { DEMO_USERS, DEMO_WORKSPACES } from "./identity.js";

export type DemoBootstrapPayload = {
  defaultWorkspaceId: "acme";
  defaultUserId: "user:alice";
  workspaces: Array<{
    id: string;
    namespace: string;
    users: string[];
  }>;
};

export function getDemoBootstrapPayload(): DemoBootstrapPayload {
  return {
    defaultWorkspaceId: "acme",
    defaultUserId: "user:alice",
    workspaces: DEMO_WORKSPACES
      .map((workspace) => ({
        id: workspace.id,
        namespace: workspace.namespace,
        users: [...DEMO_USERS].sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
