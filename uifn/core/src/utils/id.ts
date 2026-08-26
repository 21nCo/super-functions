import { createUIFnError, type UIFnPackageName } from '../errors';
import { normalizeUIFnToken } from '../algorithms/id';

const DEFAULT_NAMESPACE = 'uifn';
const DEFAULT_PREFIX = 'id';

export interface IdFactoryOptions {
  namespace?: string;
}

export interface IdFactory {
  next: (token?: string) => string;
  reset: (token?: string) => void;
  snapshot: () => Record<string, number>;
}

export interface PublicIdInput {
  prefix?: string;
  slot?: string;
}

export interface PublicIdAssertionOptions {
  package?: UIFnPackageName;
  component?: string;
  details?: Record<string, unknown>;
  recoverable?: boolean;
}

export interface PublicIdSnapshot {
  counters: Record<string, number>;
  issued: string[];
}

export interface PublicIdRegistry {
  has: (id: string) => boolean;
  register: (id: string) => string;
  reset: (prefix?: string) => void;
  snapshot: () => string[];
}

export interface DeterministicIdFactory {
  compose: (input?: string | PublicIdInput) => string;
  create: (input?: string | PublicIdInput) => string;
  reuse: (existingId: string | null | undefined, input?: string | PublicIdInput) => string;
  register: (id: string, options?: PublicIdAssertionOptions) => string;
  reset: (input?: string | PublicIdInput) => void;
  snapshot: () => PublicIdSnapshot;
}

function normalizeToken(token: string): string {
  return normalizeUIFnToken(token);
}

function normalizeNamespace(namespace?: string): string {
  return normalizeToken(namespace ?? DEFAULT_NAMESPACE) || DEFAULT_NAMESPACE;
}

function normalizePrefix(prefix?: string): string {
  return normalizeToken(prefix ?? DEFAULT_PREFIX) || DEFAULT_PREFIX;
}

function normalizeExistingId(id: string): string {
  const normalized = normalizeToken(id);
  if (!normalized) {
    throw createUIFnError({
      code: 'UIFN_ERR_INVALID_VALUE',
      package: '@uifn/core',
      component: 'PublicId',
      message: 'Public IDs MUST contain at least one non-empty segment.',
      details: { id },
    });
  }

  return normalized;
}

function normalizePublicIdInput(input?: string | PublicIdInput): Required<PublicIdInput> {
  if (typeof input === 'string') {
    return {
      prefix: normalizePrefix(input),
      slot: '',
    };
  }

  return {
    prefix: normalizePrefix(input?.prefix),
    slot: normalizeToken(input?.slot ?? ''),
  };
}

function composePublicIdBase(namespace: string, input?: string | PublicIdInput): string {
  const normalized = normalizePublicIdInput(input);
  const segments = normalized.prefix === namespace || normalized.prefix.startsWith(`${namespace}-`)
    ? [normalized.prefix]
    : [namespace, normalized.prefix];

  if (normalized.slot) {
    segments.push(normalized.slot);
  }

  return segments.join('-');
}

export function createPublicIdRegistry(): PublicIdRegistry {
  const issued = new Set<string>();

  return {
    has(id) {
      return issued.has(normalizeExistingId(id));
    },
    register(id) {
      const normalized = normalizeExistingId(id);
      issued.add(normalized);
      return normalized;
    },
    reset(prefix) {
      if (!prefix) {
        issued.clear();
        return;
      }

      const normalizedPrefix = normalizeExistingId(prefix);
      for (const id of issued) {
        if (id === normalizedPrefix || id.startsWith(`${normalizedPrefix}-`)) {
          issued.delete(id);
        }
      }
    },
    snapshot() {
      return Array.from(issued).sort();
    },
  };
}

export function assertUniquePublicId(
  id: string,
  registry: PublicIdRegistry = createPublicIdRegistry(),
  options: PublicIdAssertionOptions = {}
): string {
  const normalized = normalizeExistingId(id);

  if (registry.has(normalized)) {
    throw createUIFnError({
      code: 'UIFN_ERR_DUPLICATE_PUBLIC_ID',
      package: options.package ?? '@uifn/core',
      component: options.component,
      message: 'GA surfaces MUST NOT share fixed instance-scoped IDs.',
      details: {
        id: normalized,
        ...options.details,
      },
      recoverable: options.recoverable ?? false,
    });
  }

  registry.register(normalized);
  return normalized;
}

export function createDeterministicIdFactory(
  options: IdFactoryOptions & { registry?: PublicIdRegistry } = {}
): DeterministicIdFactory {
  const namespace = normalizeNamespace(options.namespace);
  const counters = new Map<string, number>();
  const registry = options.registry ?? createPublicIdRegistry();

  const compose = (input?: string | PublicIdInput) => composePublicIdBase(namespace, input);

  return {
    compose,
    create(input = DEFAULT_PREFIX) {
      const base = compose(input);
      const nextCount = (counters.get(base) ?? 0) + 1;
      counters.set(base, nextCount);
      return assertUniquePublicId(`${base}-${nextCount}`, registry);
    },
    reuse(existingId, input = DEFAULT_PREFIX) {
      if (existingId) {
        return assertUniquePublicId(existingId, registry);
      }

      return this.create(input);
    },
    register(id, assertionOptions = {}) {
      return assertUniquePublicId(id, registry, assertionOptions);
    },
    reset(input) {
      if (!input) {
        counters.clear();
        registry.reset();
        return;
      }

      const base = compose(input);
      counters.delete(base);
      registry.reset(base);
    },
    snapshot() {
      return {
        counters: Object.fromEntries(counters.entries()),
        issued: registry.snapshot(),
      };
    },
  };
}

export function composePublicId(
  input?: string | PublicIdInput,
  options: IdFactoryOptions = {}
): string {
  return composePublicIdBase(normalizeNamespace(options.namespace), input);
}

export function createIdFactory(options: IdFactoryOptions = {}): IdFactory {
  const factory = createDeterministicIdFactory(options);

  return {
    next(token = DEFAULT_PREFIX) {
      return factory.create(token);
    },
    reset(token?: string) {
      factory.reset(token);
    },
    snapshot() {
      return factory.snapshot().counters;
    },
  };
}

export const createIdScope = createIdFactory;
