export interface HostFnScope {
  installationId: string;
  workspaceId: string;
  projectId: string;
  environmentId: string;
}

export interface HostFnTarget {
  id: string;
  scope: HostFnScope;
  name: string;
  server: string;
  runtime: string;
  status: "ready" | "degraded" | "offline";
  updatedAt: string;
}

export interface HostFnDeployment {
  id: string;
  scope: HostFnScope;
  targetId: string;
  revision: string;
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "rolled-back";
  createdAt: string;
  updatedAt: string;
}

export interface HostFnDomain {
  id: string;
  scope: HostFnScope;
  targetId: string;
  hostname: string;
  tls: boolean;
  status: "pending" | "active" | "failed";
  updatedAt: string;
}

export interface HostFnVariable {
  id: string;
  scope: HostFnScope;
  targetId: string;
  key: string;
  updatedAt: string;
}

export interface HostFnOperatorStore {
  listTargets(scope: HostFnScope): Promise<HostFnTarget[]>;
  getTarget(scope: HostFnScope, id: string): Promise<HostFnTarget | undefined>;
  putTarget(target: HostFnTarget): Promise<void>;
  listDeployments(
    scope: HostFnScope,
    targetId?: string,
  ): Promise<HostFnDeployment[]>;
  getDeployment(
    scope: HostFnScope,
    id: string,
  ): Promise<HostFnDeployment | undefined>;
  putDeployment(deployment: HostFnDeployment): Promise<void>;
  listDomains(scope: HostFnScope, targetId?: string): Promise<HostFnDomain[]>;
  /** Atomically reserve one immutable identity and acquire a reclaimable provider-work lease. */
  claimDomainAttachment(domain: HostFnDomain): Promise<{
    domain: HostFnDomain;
    acquired: boolean;
    claimToken?: string;
  }>;
  /** Persist a terminal state only when `claimToken` is still the current lease. */
  completeDomainAttachment(domain: HostFnDomain, claimToken: string): Promise<boolean>;
  releaseDomainAttachmentClaim(scope: HostFnScope, id: string, claimToken: string): Promise<void>;
  /** Atomically retain failed compensation only while its hostname has no newer lifecycle. */
  restoreDomainCompensation(domain: HostFnDomain): Promise<boolean>;
  putDomain(domain: HostFnDomain): Promise<void>;
  deleteDomain(scope: HostFnScope, id: string): Promise<boolean>;
  listVariables(
    scope: HostFnScope,
    targetId?: string,
  ): Promise<HostFnVariable[]>;
  putVariable(variable: HostFnVariable, secretValue: string): Promise<void>;
  deleteVariable(scope: HostFnScope, id: string): Promise<boolean>;
}

export interface HostFnDeploymentExecutor {
  deploy(input: {
    target: HostFnTarget;
    deployment: HostFnDeployment;
  }): Promise<void>;
  cancel(input: {
    target: HostFnTarget;
    deployment: HostFnDeployment;
  }): Promise<void>;
  rollback(input: {
    target: HostFnTarget;
    deployment: HostFnDeployment;
  }): Promise<void>;
  restart(input: { target: HostFnTarget }): Promise<void>;
  /** Must be idempotent when retried with the same domain ID. */
  attachDomain(input: {
    target: HostFnTarget;
    domain: HostFnDomain;
  }): Promise<void>;
  detachDomain(input: {
    target: HostFnTarget;
    domain: HostFnDomain;
  }): Promise<void>;
  setVariable(input: {
    target: HostFnTarget;
    key: string;
    value: string;
  }): Promise<void>;
  deleteVariable(input: { target: HostFnTarget; key: string }): Promise<void>;
}

function providerReportedNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  return candidate.code === "not_found" || candidate.code === "NOT_FOUND" ||
    candidate.status === 404 || candidate.statusCode === 404;
}

function scopeKey(scope: HostFnScope): string {
  return JSON.stringify([
    scope.installationId,
    scope.workspaceId,
    scope.projectId,
    scope.environmentId,
  ]);
}

function scoped<T extends { scope: HostFnScope }>(
  values: Iterable<T>,
  scope: HostFnScope,
): T[] {
  const key = scopeKey(scope);
  return [...values]
    .filter((value) => scopeKey(value.scope) === key)
    .map((value) => structuredClone(value));
}

/** Self-hosted reference persistence for development and single-process installations. */
export class MemoryHostFnOperatorStore implements HostFnOperatorStore {
  private readonly targets = new Map<string, HostFnTarget>();
  private readonly deployments = new Map<string, HostFnDeployment>();
  private readonly domains = new Map<string, HostFnDomain>();
  private readonly domainAttachmentClaims = new Map<string, string>();
  private readonly variables = new Map<
    string,
    HostFnVariable & { secretValue: string }
  >();
  private key(scope: HostFnScope, id: string) {
    return JSON.stringify([
      scope.installationId,
      scope.workspaceId,
      scope.projectId,
      scope.environmentId,
      id,
    ]);
  }
  async listTargets(scope: HostFnScope) {
    return scoped(this.targets.values(), scope);
  }
  async getTarget(scope: HostFnScope, id: string) {
    const target = this.targets.get(this.key(scope, id));
    return target ? structuredClone(target) : undefined;
  }
  async putTarget(target: HostFnTarget) {
    this.targets.set(
      this.key(target.scope, target.id),
      structuredClone(target),
    );
  }
  async listDeployments(scope: HostFnScope, targetId?: string) {
    return scoped(this.deployments.values(), scope).filter(
      (item) => !targetId || item.targetId === targetId,
    );
  }
  async getDeployment(scope: HostFnScope, id: string) {
    const deployment = this.deployments.get(this.key(scope, id));
    return deployment ? structuredClone(deployment) : undefined;
  }
  async putDeployment(deployment: HostFnDeployment) {
    this.deployments.set(
      this.key(deployment.scope, deployment.id),
      structuredClone(deployment),
    );
  }
  async listDomains(scope: HostFnScope, targetId?: string) {
    return scoped(this.domains.values(), scope).filter(
      (item) => !targetId || item.targetId === targetId,
    );
  }
  async claimDomainAttachment(domain: HostFnDomain) {
    const existing = [...this.domains.values()].find(
      (candidate) =>
        scopeKey(candidate.scope) === scopeKey(domain.scope) &&
        candidate.hostname === domain.hostname,
    );
    if (existing) {
      if (existing.targetId !== domain.targetId) {
        throw new Error("HostFn domain hostname is already attached to a different target.");
      }
      if (existing.tls !== domain.tls) {
        throw new Error("HostFn domain already exists with different TLS configuration.");
      }
      const existingKey = this.key(existing.scope, existing.id);
      if (existing.status === "active" || this.domainAttachmentClaims.has(existingKey)) {
        return { domain: structuredClone(existing), acquired: false };
      }
      const retry = { ...existing, status: "pending" as const, updatedAt: domain.updatedAt };
      const claimToken = crypto.randomUUID();
      this.domains.set(existingKey, structuredClone(retry));
      this.domainAttachmentClaims.set(existingKey, claimToken);
      return { domain: structuredClone(retry), acquired: true, claimToken };
    }
    const domainKey = this.key(domain.scope, domain.id);
    const claimToken = crypto.randomUUID();
    this.domains.set(domainKey, structuredClone(domain));
    this.domainAttachmentClaims.set(domainKey, claimToken);
    return { domain: structuredClone(domain), acquired: true, claimToken };
  }
  async releaseDomainAttachmentClaim(scope: HostFnScope, id: string, claimToken: string) {
    const key = this.key(scope, id);
    if (this.domainAttachmentClaims.get(key) === claimToken) {
      this.domainAttachmentClaims.delete(key);
    }
  }
  async completeDomainAttachment(domain: HostFnDomain, claimToken: string) {
    const key = this.key(domain.scope, domain.id);
    if (!this.domains.has(key) || this.domainAttachmentClaims.get(key) !== claimToken) return false;
    this.domains.set(key, structuredClone(domain));
    this.domainAttachmentClaims.delete(key);
    return true;
  }
  async restoreDomainCompensation(domain: HostFnDomain) {
    const hostnameClaimed = [...this.domains.values()].some(
      (candidate) =>
        scopeKey(candidate.scope) === scopeKey(domain.scope) &&
        candidate.hostname === domain.hostname,
    );
    if (hostnameClaimed) return false;
    this.domains.set(this.key(domain.scope, domain.id), structuredClone(domain));
    return true;
  }
  async putDomain(domain: HostFnDomain) {
    const key = this.key(domain.scope, domain.id);
    this.domains.set(key, structuredClone(domain));
    if (domain.status !== "pending") this.domainAttachmentClaims.delete(key);
  }
  async deleteDomain(scope: HostFnScope, id: string) {
    const key = this.key(scope, id);
    this.domainAttachmentClaims.delete(key);
    return this.domains.delete(key);
  }
  async listVariables(scope: HostFnScope, targetId?: string) {
    return scoped(this.variables.values(), scope)
      .filter((item) => !targetId || item.targetId === targetId)
      .map(({ secretValue: _secretValue, ...item }) => item);
  }
  async putVariable(variable: HostFnVariable, secretValue: string) {
    this.variables.set(this.key(variable.scope, variable.id), {
      ...structuredClone(variable),
      secretValue,
    });
  }
  async deleteVariable(scope: HostFnScope, id: string) {
    return this.variables.delete(this.key(scope, id));
  }
}

function identifier(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export class HostFnOperatorService {
  private readonly domainAttachments = new Map<
    string,
    { tls: boolean; promise: Promise<HostFnDomain> }
  >();

  constructor(
    private readonly store: HostFnOperatorStore,
    private readonly executor: HostFnDeploymentExecutor,
  ) {}
  listTargets(scope: HostFnScope) {
    return this.store.listTargets(scope);
  }
  getTarget(scope: HostFnScope, id: string) {
    return this.store.getTarget(scope, id);
  }
  listDeployments(scope: HostFnScope, targetId?: string) {
    return this.store.listDeployments(scope, targetId);
  }
  getDeployment(scope: HostFnScope, id: string) {
    return this.store.getDeployment(scope, id);
  }
  listDomains(scope: HostFnScope, targetId?: string) {
    return this.store.listDomains(scope, targetId);
  }
  listVariables(scope: HostFnScope, targetId?: string) {
    return this.store.listVariables(scope, targetId);
  }
  private async target(scope: HostFnScope, id: string) {
    const value = await this.store.getTarget(scope, id);
    if (!value) throw new Error(`HostFn target not found: ${id}`);
    return value;
  }
  async deploy(
    scope: HostFnScope,
    input: { targetId: string; revision: string },
  ) {
    const target = await this.target(scope, input.targetId);
    const now = new Date().toISOString();
    const deployment: HostFnDeployment = {
      id: identifier("deployment"),
      scope,
      targetId: target.id,
      revision: input.revision,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    await this.store.putDeployment(deployment);
    await this.executor.deploy({ target, deployment });
    return deployment;
  }
  async cancel(scope: HostFnScope, id: string) {
    const deployment = await this.store.getDeployment(scope, id);
    if (!deployment) throw new Error(`HostFn deployment not found: ${id}`);
    const target = await this.target(scope, deployment.targetId);
    await this.executor.cancel({ target, deployment });
    const updated = {
      ...deployment,
      status: "cancelled" as const,
      updatedAt: new Date().toISOString(),
    };
    await this.store.putDeployment(updated);
    return updated;
  }
  async rollback(scope: HostFnScope, id: string) {
    const deployment = await this.store.getDeployment(scope, id);
    if (!deployment) throw new Error(`HostFn deployment not found: ${id}`);
    const target = await this.target(scope, deployment.targetId);
    await this.executor.rollback({ target, deployment });
    const updated = {
      ...deployment,
      status: "rolled-back" as const,
      updatedAt: new Date().toISOString(),
    };
    await this.store.putDeployment(updated);
    return updated;
  }
  async restart(scope: HostFnScope, targetId: string) {
    const target = await this.target(scope, targetId);
    await this.executor.restart({ target });
    return target;
  }
  async attachDomain(
    scope: HostFnScope,
    input: { targetId: string; hostname: string; tls?: boolean },
  ) {
    const requestedTls = input.tls ?? true;
    const attachmentKey = JSON.stringify([scopeKey(scope), input.targetId, input.hostname]);
    const inFlight = this.domainAttachments.get(attachmentKey);
    if (inFlight) {
      if (inFlight.tls !== requestedTls) {
        throw new Error("HostFn domain already exists with different TLS configuration.");
      }
      return inFlight.promise;
    }
    const promise = this.attachDomainOnce(scope, { ...input, tls: requestedTls });
    this.domainAttachments.set(attachmentKey, { tls: requestedTls, promise });
    try {
      return await promise;
    } finally {
      if (this.domainAttachments.get(attachmentKey)?.promise === promise) {
        this.domainAttachments.delete(attachmentKey);
      }
    }
  }

  private async attachDomainOnce(
    scope: HostFnScope,
    input: { targetId: string; hostname: string; tls: boolean },
  ) {
    const target = await this.target(scope, input.targetId);
    const claim = await this.store.claimDomainAttachment({
      id: identifier("domain"),
      scope,
      targetId: target.id,
      hostname: input.hostname,
      tls: input.tls,
      status: "pending",
      updatedAt: new Date().toISOString(),
    });
    const domain = claim.domain;
    if (!claim.acquired) return domain;
    const claimToken = claim.claimToken!;
    const currentDomain = async () =>
      (await this.store.listDomains(scope, target.id)).find((candidate) => candidate.id === domain.id);
    const compensateDeletedDomain = async () => {
      try {
        await this.executor.detachDomain({ target, domain });
      } catch (error) {
        if (providerReportedNotFound(error)) return;
        // Restore a durable, provider-idempotent intent so a transient
        // compensation failure remains visible and detach can be retried.
        await this.store.restoreDomainCompensation({
          ...domain,
          status: "failed",
          updatedAt: new Date().toISOString(),
        });
        throw error;
      }
    };
    try {
      // Executors must make retries with the same domain ID idempotent. Reusing
      // a failed/pending intent lets ambiguous provider outcomes converge.
      await this.executor.attachDomain({ target, domain });
    } catch (error) {
      try {
        const completed = await this.store.completeDomainAttachment({
          ...domain,
          status: "failed",
          updatedAt: new Date().toISOString(),
        }, claimToken);
        if (!completed) {
          const current = await currentDomain();
          if (current) return current;
          await compensateDeletedDomain();
        }
      } catch {
        // The already-durable pending intent remains discoverable and reusable.
      }
      try {
        await this.store.releaseDomainAttachmentClaim(scope, domain.id, claimToken);
      } catch {
        // Durable stores must expire abandoned provider-work leases.
      }
      throw error;
    }
    const active = { ...domain, status: "active" as const };
    try {
      const completed = await this.store.completeDomainAttachment(active, claimToken);
      if (!completed) {
        const current = await currentDomain();
        if (current) return current;
        await compensateDeletedDomain();
        throw new Error("HostFn domain attachment lease was superseded.");
      }
    } catch (error) {
      try {
        await this.store.releaseDomainAttachmentClaim(scope, domain.id, claimToken);
      } catch {
        // Durable stores must expire abandoned provider-work leases.
      }
      throw error;
    }
    return active;
  }
  async detachDomain(scope: HostFnScope, id: string) {
    const domain = (await this.store.listDomains(scope)).find(
      (item) => item.id === id,
    );
    if (!domain) throw new Error(`HostFn domain not found: ${id}`);
    const target = await this.target(scope, domain.targetId);
    try {
      await this.executor.detachDomain({ target, domain });
    } catch (error) {
      if (!providerReportedNotFound(error)) throw error;
    }
    await this.store.deleteDomain(scope, id);
    return domain;
  }
  async setVariable(
    scope: HostFnScope,
    input: { targetId: string; key: string; value: string },
  ) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(input.key))
      throw new Error("Invalid environment variable key.");
    const target = await this.target(scope, input.targetId);
    const variable: HostFnVariable = {
      id: `${target.id}:${input.key}`,
      scope,
      targetId: target.id,
      key: input.key,
      updatedAt: new Date().toISOString(),
    };
    // Persist a deletion-capable intent before the provider side effect so an
    // ambiguous or acknowledged provider write always remains reconcilable.
    await this.store.putVariable(variable, input.value);
    await this.executor.setVariable({
      target,
      key: input.key,
      value: input.value,
    });
    return variable;
  }
  async deleteVariable(scope: HostFnScope, id: string) {
    const variable = (await this.store.listVariables(scope)).find(
      (item) => item.id === id,
    );
    if (!variable) throw new Error(`HostFn variable not found: ${id}`);
    const target = await this.target(scope, variable.targetId);
    try {
      await this.executor.deleteVariable({ target, key: variable.key });
    } catch (error) {
      if (!providerReportedNotFound(error)) throw error;
    }
    await this.store.deleteVariable(scope, id);
    return variable;
  }
}
