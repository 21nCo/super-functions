import type { DevFnConfig } from "@devfn/config";
import type { ManagedComposeService } from "@devfn/compose";
import type { PortAllocation } from "@devfn/ports";
import type { ManagedProcess } from "@devfn/processes";
import type { ProxyRoute } from "@devfn/proxy";

export type LifecycleState = "planning" | "starting" | "ready" | "degraded" | "failed" | "stopped";

export interface ProjectIdentity {
  projectId: string;
  repositoryRoot: string;
  repositoryIdentity: string;
  worktreePath: string;
  revision?: string;
  branch?: string;
}

export interface InstanceIdentity extends ProjectIdentity { instanceId: string }

export interface LifecyclePlan {
  profile: string;
  nodes: Array<{ name: string; kind: "process" | "service"; dependencies: string[] }>;
  portNames: string[];
  proxy: boolean;
}

export interface CleanupResult { stoppedProcesses: string[]; stoppedServices: string[]; removedProxy: boolean; releasedPorts: boolean; errors: string[] }

export interface LifecycleReceipt {
  version: 1;
  projectId: string;
  instanceId: string;
  invocationId: string;
  profile: string;
  state: LifecycleState;
  root: string;
  runtimeDir: string;
  stateDir?: string;
  startedAt: string;
  updatedAt: string;
  allocations: PortAllocation[];
  processes: ManagedProcess[];
  services: ManagedComposeService[];
  startedNodes?: Array<{ name: string; kind: "process" | "service" }>;
  routes: ProxyRoute[];
  urls: Record<string, string>;
  environmentOutputs: string[];
  cleanup?: CleanupResult;
  error?: { code: string; message: string };
}

export interface UpOptions { config: DevFnConfig; root: string; profile?: string; stateDir?: string; allowPublic?: boolean }

export class DevFnError extends Error {
  public constructor(
    public readonly code:
      | "DEVFN_PROFILE_NOT_FOUND"
      | "DEVFN_DEPENDENCY_CYCLE"
      | "DEVFN_ALREADY_RUNNING"
      | "DEVFN_NOT_RUNNING"
      | "DEVFN_START_FAILED"
      | "DEVFN_RUNTIME_INVALID"
      | "DEVFN_PREREQUISITE_MISSING"
      | "DEVFN_PUBLIC_EXPOSURE_CONFIRMATION_REQUIRED"
      | "DEVFN_MANIFEST_UNTRUSTED"
      | "DEVFN_URL_NOT_FOUND",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) { super(message); this.name = "DevFnError"; }
}
