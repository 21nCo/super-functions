import type { PortSpec } from "@devfn/config";

export type AllocationState = "planned" | "active" | "stale" | "released" | "externally-occupied";

export interface ProcessOwner {
  pid: number;
  birthSignature?: string;
}

export interface ContainerOwner {
  id: string;
  name?: string;
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
  state: "planning" | "starting" | "ready" | "failed" | "stopped";
  createdAt: string;
  updatedAt: string;
  errorCode?: string;
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
