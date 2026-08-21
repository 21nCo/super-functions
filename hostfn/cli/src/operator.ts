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

function scopeKey(scope: HostFnScope): string {
  return [
    scope.installationId,
    scope.workspaceId,
    scope.projectId,
    scope.environmentId,
  ].join("/");
}

function scoped<T extends { scope: HostFnScope }>(
  values: Iterable<T>,
  scope: HostFnScope,
): T[] {
  const key = scopeKey(scope);
  return [...values].filter((value) => scopeKey(value.scope) === key);
}

/** Self-hosted reference persistence for development and single-process installations. */
export class MemoryHostFnOperatorStore implements HostFnOperatorStore {
  private readonly targets = new Map<string, HostFnTarget>();
  private readonly deployments = new Map<string, HostFnDeployment>();
  private readonly domains = new Map<string, HostFnDomain>();
  private readonly variables = new Map<
    string,
    HostFnVariable & { secretValue: string }
  >();
  private key(scope: HostFnScope, id: string) {
    return `${scopeKey(scope)}:${id}`;
  }
  async listTargets(scope: HostFnScope) {
    return scoped(this.targets.values(), scope);
  }
  async getTarget(scope: HostFnScope, id: string) {
    return this.targets.get(this.key(scope, id));
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
    return this.deployments.get(this.key(scope, id));
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
  async putDomain(domain: HostFnDomain) {
    this.domains.set(
      this.key(domain.scope, domain.id),
      structuredClone(domain),
    );
  }
  async deleteDomain(scope: HostFnScope, id: string) {
    return this.domains.delete(this.key(scope, id));
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
    const target = await this.target(scope, input.targetId);
    const domain: HostFnDomain = {
      id: identifier("domain"),
      scope,
      targetId: target.id,
      hostname: input.hostname,
      tls: input.tls ?? true,
      status: "pending",
      updatedAt: new Date().toISOString(),
    };
    await this.executor.attachDomain({ target, domain });
    const active = { ...domain, status: "active" as const };
    await this.store.putDomain(active);
    return active;
  }
  async detachDomain(scope: HostFnScope, id: string) {
    const domain = (await this.store.listDomains(scope)).find(
      (item) => item.id === id,
    );
    if (!domain) throw new Error(`HostFn domain not found: ${id}`);
    const target = await this.target(scope, domain.targetId);
    await this.executor.detachDomain({ target, domain });
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
    await this.executor.setVariable({
      target,
      key: input.key,
      value: input.value,
    });
    const variable: HostFnVariable = {
      id: `${target.id}:${input.key}`,
      scope,
      targetId: target.id,
      key: input.key,
      updatedAt: new Date().toISOString(),
    };
    await this.store.putVariable(variable, input.value);
    return variable;
  }
  async deleteVariable(scope: HostFnScope, id: string) {
    const variable = (await this.store.listVariables(scope)).find(
      (item) => item.id === id,
    );
    if (!variable) throw new Error(`HostFn variable not found: ${id}`);
    const target = await this.target(scope, variable.targetId);
    await this.executor.deleteVariable({ target, key: variable.key });
    await this.store.deleteVariable(scope, id);
    return variable;
  }
}
