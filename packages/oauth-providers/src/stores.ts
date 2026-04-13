import type { ConsentRecord, PolicyAuditEvent } from "./policy-registry.js";

export interface ProviderPolicyConsentStore {
  put(record: ConsentRecord): Promise<void>;
  list(): Promise<ConsentRecord[]>;
}

export interface ProviderPolicyAuditStore {
  put(event: PolicyAuditEvent): Promise<void>;
  list(): Promise<PolicyAuditEvent[]>;
}

export class MemoryProviderPolicyConsentStore implements ProviderPolicyConsentStore {
  private readonly records: ConsentRecord[] = [];

  async put(record: ConsentRecord): Promise<void> {
    this.records.push(cloneConsent(record));
  }

  async list(): Promise<ConsentRecord[]> {
    return this.records.map((record) => cloneConsent(record));
  }
}

export class MemoryProviderPolicyAuditStore implements ProviderPolicyAuditStore {
  private readonly events: PolicyAuditEvent[] = [];

  async put(event: PolicyAuditEvent): Promise<void> {
    this.events.push(cloneAuditEvent(event));
  }

  async list(): Promise<PolicyAuditEvent[]> {
    return this.events.map((event) => cloneAuditEvent(event));
  }
}

function cloneConsent(record: ConsentRecord): ConsentRecord {
  return {
    ...record,
    scopes: [...record.scopes]
  };
}

function cloneAuditEvent(event: PolicyAuditEvent): PolicyAuditEvent {
  return { ...event };
}
