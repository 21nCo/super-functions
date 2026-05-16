import type { AssertionResult } from "../types.js";

type UnknownRecord = Record<string, unknown>;

class AssertionFailure extends Error {
  expected?: unknown;
  actual?: unknown;

  constructor(message: string, expected?: unknown, actual?: unknown) {
    super(message);
    this.name = "AssertionFailure";
    this.expected = expected;
    this.actual = actual;
  }
}

interface AssertionRecorder {
  currentTestName: string | null;
  sequence: number;
  results: AssertionResult[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonPath(path: string): Array<string | number> {
  if (!path.startsWith("$")) {
    throw new Error("JSONPath must start with '$'");
  }

  const segments: Array<string | number> = [];
  let index = 1;

  while (index < path.length) {
    const char = path[index];
    if (char === ".") {
      index += 1;
      const start = index;
      while (index < path.length && /[A-Za-z0-9_\-$]/.test(path[index] ?? "")) {
        index += 1;
      }
      const key = path.slice(start, index);
      if (!key) {
        throw new Error(`Invalid JSONPath near '${path.slice(start)}'`);
      }
      segments.push(key);
      continue;
    }

    if (char === "[") {
      index += 1;
      const end = path.indexOf("]", index);
      if (end === -1) {
        throw new Error("JSONPath bracket is not closed");
      }
      const token = path.slice(index, end).trim();
      if (/^\d+$/.test(token)) {
        segments.push(Number(token));
      } else if (
        (token.startsWith("\"") && token.endsWith("\"")) ||
        (token.startsWith("'") && token.endsWith("'"))
      ) {
        segments.push(token.slice(1, -1));
      } else {
        throw new Error(`Unsupported JSONPath segment: [${token}]`);
      }
      index = end + 1;
      continue;
    }

    throw new Error(`Invalid JSONPath token '${char}' in '${path}'`);
  }

  return segments;
}

function resolveJsonPath(value: unknown, path: string): unknown {
  let cursor = value;
  for (const segment of parseJsonPath(path)) {
    if (typeof segment === "number") {
      if (!Array.isArray(cursor)) {
        return undefined;
      }
      cursor = cursor[segment];
      continue;
    }

    if (!isRecord(cursor) && !Array.isArray(cursor)) {
      return undefined;
    }

    cursor = (cursor as UnknownRecord)[segment];
  }
  return cursor;
}

function validateAgainstSchema(
  data: unknown,
  schema: UnknownRecord,
  path = "$"
): string[] {
  const errors: string[] = [];
  const type = schema.type;

  if (typeof type === "string") {
    if (type === "array" && !Array.isArray(data)) {
      errors.push(`${path} should be array`);
    } else if (type === "object" && !isRecord(data)) {
      errors.push(`${path} should be object`);
    } else if (type === "string" && typeof data !== "string") {
      errors.push(`${path} should be string`);
    } else if (type === "number" && typeof data !== "number") {
      errors.push(`${path} should be number`);
    } else if (type === "integer" && (!Number.isInteger(data) || typeof data !== "number")) {
      errors.push(`${path} should be integer`);
    } else if (type === "boolean" && typeof data !== "boolean") {
      errors.push(`${path} should be boolean`);
    }
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0 && !schema.enum.includes(data)) {
    errors.push(`${path} should be one of enum values`);
  }

  if (type === "object" && isRecord(data)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (typeof key === "string" && !(key in data)) {
        errors.push(`${path}.${key} is required`);
      }
    }

    if (isRecord(schema.properties)) {
      for (const [key, propertySchema] of Object.entries(schema.properties)) {
        if (!(key in data) || !isRecord(propertySchema)) {
          continue;
        }
        errors.push(...validateAgainstSchema(data[key], propertySchema, `${path}.${key}`));
      }
    }
  }

  if (type === "array" && Array.isArray(data) && isRecord(schema.items)) {
    for (let idx = 0; idx < data.length; idx += 1) {
      errors.push(...validateAgainstSchema(data[idx], schema.items, `${path}[${idx}]`));
    }
  }

  return errors;
}

function normalizeError(error: unknown): {
  message: string;
  expected?: unknown;
  actual?: unknown;
} {
  if (error instanceof AssertionFailure) {
    return {
      message: error.message,
      expected: error.expected,
      actual: error.actual,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: String(error) };
}

function assertionName(state: AssertionRecorder): string {
  if (state.currentTestName) {
    return state.currentTestName;
  }
  state.sequence += 1;
  return `assertion ${state.sequence}`;
}

function pushResult(
  state: AssertionRecorder,
  payload: {
    passed: boolean;
    expected?: unknown;
    actual?: unknown;
    error?: string;
  }
): void {
  state.results.push({
    name: assertionName(state),
    passed: payload.passed,
    expected: payload.expected,
    actual: payload.actual,
    error: payload.error,
  });
}

function runAssertion(
  state: AssertionRecorder,
  execute: () => void
): void {
  try {
    execute();
    pushResult(state, { passed: true });
  } catch (error) {
    const normalized = normalizeError(error);
    pushResult(state, {
      passed: false,
      expected: normalized.expected,
      actual: normalized.actual,
      error: normalized.message,
    });
    throw error;
  }
}

function createExpectFn(state: AssertionRecorder) {
  function expect(actual: unknown) {
    const to: {
      equal(expected: unknown): void;
      include(expected: unknown): void;
      matchSchema(schema: UnknownRecord): void;
      have: {
        property(name: string, expected?: unknown): void;
        length: ((length: number) => void) & { above(min: number): void };
        jsonPath(path: string, expected?: unknown): void;
      };
      be: {
        below(expected: number): void;
      };
    } = {
      equal(expected) {
        runAssertion(state, () => {
          if (!Object.is(actual, expected)) {
            throw new AssertionFailure(
              `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`,
              expected,
              actual
            );
          }
        });
      },
      include(expected) {
        runAssertion(state, () => {
          let passed = false;
          if (typeof actual === "string" && typeof expected === "string") {
            passed = actual.includes(expected);
          } else if (Array.isArray(actual)) {
            passed = actual.includes(expected);
          } else if (isRecord(actual) && typeof expected === "string") {
            passed = expected in actual;
          }

          if (!passed) {
            throw new AssertionFailure(
              `Expected value to include ${JSON.stringify(expected)}`,
              expected,
              actual
            );
          }
        });
      },
      matchSchema(schema) {
        runAssertion(state, () => {
          const errors = validateAgainstSchema(actual, schema);
          if (errors.length > 0) {
            throw new AssertionFailure(
              `Schema validation failed: ${errors.join(", ")}`,
              schema,
              actual
            );
          }
        });
      },
      have: {
        property(name, expected) {
          runAssertion(state, () => {
            if (!isRecord(actual) && !Array.isArray(actual)) {
              throw new AssertionFailure(
                `Expected value to have property '${name}'`,
                name,
                actual
              );
            }

            const current = (actual as UnknownRecord)[name];
            if (current === undefined) {
              throw new AssertionFailure(
                `Expected value to have property '${name}'`,
                name,
                actual
              );
            }

            if (arguments.length === 2 && !Object.is(current, expected)) {
              throw new AssertionFailure(
                `Expected property '${name}' to equal ${JSON.stringify(expected)}`,
                expected,
                current
              );
            }
          });
        },
        length: Object.assign(
          (expectedLength: number) => {
            runAssertion(state, () => {
              const candidate = actual as { length?: number };
              if (candidate?.length !== expectedLength) {
                throw new AssertionFailure(
                  `Expected length ${expectedLength} but got ${String(candidate?.length)}`,
                  expectedLength,
                  candidate?.length
                );
              }
            });
          },
          {
            above(min: number) {
              runAssertion(state, () => {
                const candidate = actual as { length?: number };
                if (typeof candidate?.length !== "number" || candidate.length <= min) {
                  throw new AssertionFailure(
                    `Expected length to be above ${min}`,
                    `> ${min}`,
                    candidate?.length
                  );
                }
              });
            },
          }
        ),
        jsonPath(path, expected) {
          runAssertion(state, () => {
            const resolved = resolveJsonPath(actual, path);
            if (arguments.length === 2) {
              if (!Object.is(resolved, expected)) {
                throw new AssertionFailure(
                  `Expected JSONPath ${path} to equal ${JSON.stringify(expected)}`,
                  expected,
                  resolved
                );
              }
            } else if (resolved === undefined) {
              throw new AssertionFailure(
                `Expected JSONPath ${path} to exist`,
                "defined",
                resolved
              );
            }
          });
        },
      },
      be: {
        below(expected) {
          runAssertion(state, () => {
            if (typeof actual !== "number" || actual >= expected) {
              throw new AssertionFailure(
                `Expected ${JSON.stringify(actual)} to be below ${expected}`,
                `< ${expected}`,
                actual
              );
            }
          });
        },
      },
    };

    return { to };
  }

  return expect;
}

function createTestFn(state: AssertionRecorder) {
  return async function test(name: string, fn: () => unknown): Promise<void> {
    const before = state.results.length;
    state.currentTestName = name;
    try {
      await Promise.resolve(fn());
      if (state.results.length === before) {
        pushResult(state, { passed: true });
      }
    } catch (error) {
      if (state.results.length === before) {
        const normalized = normalizeError(error);
        pushResult(state, {
          passed: false,
          expected: normalized.expected,
          actual: normalized.actual,
          error: normalized.message,
        });
      }
    } finally {
      state.currentTestName = null;
    }
  };
}

export interface AssertionRuntime {
  expect: ReturnType<typeof createExpectFn>;
  test: ReturnType<typeof createTestFn>;
  getResults(): AssertionResult[];
}

export function createAssertionRuntime(): AssertionRuntime {
  const state: AssertionRecorder = {
    currentTestName: null,
    sequence: 0,
    results: [],
  };

  return {
    expect: createExpectFn(state),
    test: createTestFn(state),
    getResults() {
      return [...state.results];
    },
  };
}
