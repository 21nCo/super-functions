import type { PortSpec } from "@devfn/config";

export type AllocationState = "planned" | "active" | "stale" | "released" | "externally-occupied";

export interface ProcessOwner {
  pid: number;
  birthSignature?: string;
}

export interface ContainerOwner {
  id: string;
  name?: string;
  dockerEnvironment?: Record<string, string>;
}

/** A process or container a lifecycle started, recorded when it started. */
export interface LifecycleOwner {
  node: string;
  process?: ProcessOwner;
  container?: ContainerOwner;
}

export interface PortAllocation {
  id: string;
  projectId: string;
  instanceId: string;
  service: string;
  protocol: "tcp" | "udp";
  host: string;
  port: number;
  internalPort?: number;
  hostname?: string;
  invocationId: string;
  state: AllocationState;
  source: "exact" | "stable" | "preferred" | "range" | "fallback" | "ephemeral";
  process?: ProcessOwner;
  container?: ContainerOwner;
  createdAt: string;
  updatedAt: string;
  releasedAt?: string;
}

export interface RegistryInvocation {
  id: string;
  projectId: string;
  instanceId: string;
  profile: string;
  state: "planning" | "starting" | "ready" | "stopping" | "failed" | "stopped";
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
  proxyListenerPorts?: number[];
  /** An ended invocation keeps its listener claim until conclusive evidence retires it. */
  proxyClaimRetained?: true;
  replacingInvocationId?: string;
  /** Set by reserve: every started node's owner identity is recorded here, so an empty list proves none started. */
  ownerJournal?: true;
  owners?: LifecycleOwner[];
  /** Compose nodes whose launch began but whose owner identity is not recorded yet. */
  launching?: string[];
  /** What each launching Compose node may create or start, so teardown can find it without a recorded identity. */
  composeLaunches?: Record<string, ComposeLaunchRecord>;
}

export interface ComposeLaunchRecord {
  projectName: string;
  composeService: string;
  /** Pre-existing containers are reused, not recreated; those already running are never stopped. */
  preExisting: boolean;
  existingContainerIds: string[];
  runningContainerIds: string[];
  dockerEnvironment?: Record<string, string>;
  /** The gated launcher, recorded before it may create or start anything. */
  launcher?: ProcessOwner;
}

export interface RegistryState {
  version: 1;
  revision: number;
  allocations: PortAllocation[];
  invocations: RegistryInvocation[];
}

export interface ReservationRequest {
  name: string;
  spec: PortSpec;
  hostname?: string;
}

export interface ReservationInput {
  projectId: string;
  instanceId: string;
  invocationId: string;
  profile: string;
  requests: ReservationRequest[];
  fallbackRange?: [number, number];
  preferredRange?: [number, number];
  protectedPorts?: Set<number>;
  excludedPorts?: Set<number>;
  proxyListenerPorts?: readonly number[];
  /** The same instance's ready invocation whose leases will be replaced after validation. */
  replacingInvocationId?: string;
}

export interface ListenerInfo {
  protocol: "tcp" | "udp";
  host: string;
  port: number;
  pid?: number;
  process?: string;
  containerId?: string;
  source: "os" | "docker";
}

export interface ListenerScanResult {
  listeners: ListenerInfo[];
  inspection: { tcp: boolean; udp: boolean; docker: boolean };
}

export class PortRegistryError extends Error {
  public constructor(
    public readonly code: "DEVFN_PORT_CONFLICT" | "DEVFN_REGISTRY_LOCK_TIMEOUT" | "DEVFN_REGISTRY_INVALID",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PortRegistryError";
  }
}
