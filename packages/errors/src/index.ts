export type ErrorDefinition = {
  code: string;
  httpStatus: number;
  retryable: boolean;
  defaultMessage?: string;
};

export class SuperfunctionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: string;
    message: string;
    status: number;
    retryable: boolean;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = 'SuperfunctionError';
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
    this.details = input.details;
  }
}

export type ErrorRegistry = {
  register(definition: ErrorDefinition): void;
  registerMany(definitions: ErrorDefinition[]): void;
  has(code: string): boolean;
  resolve(code: string): ErrorDefinition;
  resolveOrDefault(code: string, fallback: Omit<ErrorDefinition, 'code'>): ErrorDefinition;
  list(): ErrorDefinition[];
};

export function createErrorRegistry(initialDefinitions: ErrorDefinition[] = []): ErrorRegistry {
  const definitions = new Map<string, ErrorDefinition>();

  for (const definition of initialDefinitions) {
    definitions.set(definition.code, { ...definition });
  }

  return {
    register(definition: ErrorDefinition): void {
      definitions.set(definition.code, { ...definition });
    },

    registerMany(newDefinitions: ErrorDefinition[]): void {
      for (const definition of newDefinitions) {
        definitions.set(definition.code, { ...definition });
      }
    },

    has(code: string): boolean {
      return definitions.has(code);
    },

    resolve(code: string): ErrorDefinition {
      const definition = definitions.get(code);
      if (!definition) {
        throw new SuperfunctionError({
          code: 'ERROR_CODE_UNREGISTERED',
          message: `Error code is not registered: ${code}`,
          status: 500,
          retryable: false,
          details: { code },
        });
      }

      return { ...definition };
    },

    resolveOrDefault(code: string, fallback: Omit<ErrorDefinition, 'code'>): ErrorDefinition {
      const definition = definitions.get(code);
      if (definition) {
        return { ...definition };
      }

      return {
        code,
        httpStatus: fallback.httpStatus,
        retryable: fallback.retryable,
        defaultMessage: fallback.defaultMessage,
      };
    },

    list(): ErrorDefinition[] {
      return [...definitions.values()].map((definition) => ({ ...definition }));
    },
  };
}

export function createTypedError(input: {
  code: string;
  message?: string;
  details?: Record<string, unknown>;
  registry: ErrorRegistry;
}): SuperfunctionError {
  const definition = input.registry.resolve(input.code);
  return new SuperfunctionError({
    code: input.code,
    message: input.message ?? definition.defaultMessage ?? input.code,
    status: definition.httpStatus,
    retryable: definition.retryable,
    details: input.details,
  });
}
