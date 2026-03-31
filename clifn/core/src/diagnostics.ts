const SENSITIVE_KEY_PATTERN =
  /(authorization|token|secret|password|cookie|api[-_]?key|session[-_]?id|access[-_]?key|refresh[-_]?token)/i;

export type DiagnosticSeverity = "error" | "warning" | "info";
export type DiagnosticDetails = Record<string, unknown>;

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path?: string;
  details?: DiagnosticDetails;
}

export interface DiagnosticReport {
  ok: boolean;
  diagnostics: readonly Diagnostic[];
}

const SEVERITY_ORDER: Record<DiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const CIRCULAR_SENTINEL = "[Circular]";

function cloneValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return CIRCULAR_SENTINEL;
    }

    seen.add(value);
    try {
      return value.map((item) => cloneValue(item, seen));
    } finally {
      seen.delete(value);
    }
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return CIRCULAR_SENTINEL;
    }

    seen.add(value);
    try {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, cloneValue(nested, seen)])
      );
    } finally {
      seen.delete(value);
    }
  }

  return value;
}

export function redactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return CIRCULAR_SENTINEL;
    }

    seen.add(value);
    try {
      return value.map((item) => redactValue(item, seen));
    } finally {
      seen.delete(value);
    }
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return CIRCULAR_SENTINEL;
    }

    seen.add(value);
    try {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
          if (SENSITIVE_KEY_PATTERN.test(key)) {
            return [key, "[REDACTED]"];
          }
          return [key, redactValue(nested, seen)];
        })
      );
    } finally {
      seen.delete(value);
    }
  }

  return value;
}

function normalizeForSerialization(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return CIRCULAR_SENTINEL;
    }

    seen.add(value);
    try {
      return value.map((item) => normalizeForSerialization(item, seen));
    } finally {
      seen.delete(value);
    }
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return CIRCULAR_SENTINEL;
    }

    seen.add(value);
    try {
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
          .sort((left, right) => left.localeCompare(right))
          .map((key) => [key, normalizeForSerialization((value as Record<string, unknown>)[key], seen)])
      );
    } finally {
      seen.delete(value);
    }
  }

  return value;
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return (
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message) ||
    (left.path ?? "").localeCompare(right.path ?? "")
  );
}

function toReport(input: readonly Diagnostic[]): DiagnosticReport {
  const diagnostics = sortDiagnostics(redactDiagnostics(input));
  return {
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    diagnostics,
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForSerialization(value));
}

export function createDiagnostic(input: Diagnostic): Diagnostic {
  return {
    code: input.code,
    severity: input.severity,
    message: input.message,
    path: input.path,
    details: input.details ? (cloneValue(input.details) as DiagnosticDetails) : undefined,
  };
}

export function sortDiagnostics(input: readonly Diagnostic[]): Diagnostic[] {
  return input
    .map((diagnostic, index) => ({
      diagnostic: createDiagnostic(diagnostic),
      index,
    }))
    .sort((left, right) => compareDiagnostics(left.diagnostic, right.diagnostic) || left.index - right.index)
    .map((entry) => entry.diagnostic);
}

export function redactDiagnostics(input: readonly Diagnostic[]): Diagnostic[] {
  return input.map((diagnostic) => ({
    ...createDiagnostic(diagnostic),
    details: diagnostic.details ? (redactValue(diagnostic.details) as DiagnosticDetails) : undefined,
  }));
}

export function formatDiagnosticsText(input: readonly Diagnostic[]): string {
  const report = toReport(input);
  const lines: string[] = [];

  for (const diagnostic of report.diagnostics) {
    lines.push(`[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);

    if (diagnostic.path) {
      lines.push(`  path: ${diagnostic.path}`);
    }

    if (diagnostic.details) {
      lines.push(`  details: ${stableStringify(diagnostic.details)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function formatDiagnosticsJson(input: readonly Diagnostic[]): string {
  return `${stableStringify(toReport(input))}\n`;
}
