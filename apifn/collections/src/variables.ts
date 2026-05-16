import { existsSync, readFileSync } from "node:fs";
import { parse as parseDotEnv } from "dotenv";

export interface VariableResolutionInput {
  overrides?: Record<string, string>;
  environment?: Record<string, string>;
  collection?: Record<string, string>;
  processEnv?: NodeJS.ProcessEnv;
}

export interface InterpolationResult {
  value: string;
  warnings: string[];
}

export function loadDotEnvFile(dotEnvPath = ".env"): Record<string, string> {
  if (!existsSync(dotEnvPath)) {
    return {};
  }

  const raw = readFileSync(dotEnvPath, "utf8");
  return parseDotEnv(raw);
}

export function resolveVariableContext(input: VariableResolutionInput): Record<string, string> {
  const resolved: Record<string, string> = {};

  Object.assign(resolved, input.collection ?? {});
  Object.assign(resolved, input.environment ?? {});
  Object.assign(resolved, input.overrides ?? {});

  return resolved;
}

export function interpolateVariables(
  template: string,
  context: Record<string, string>,
  options?: {
    processEnv?: NodeJS.ProcessEnv;
  }
): InterpolationResult {
  const warnings: string[] = [];
  const processEnv = options?.processEnv ?? process.env;
  let value = "";
  let cursor = 0;

  while (cursor < template.length) {
    const start = template.indexOf("{{", cursor);
    if (start === -1) {
      value += template.slice(cursor);
      break;
    }

    const end = template.indexOf("}}", start + 2);
    if (end === -1) {
      value += template.slice(cursor);
      break;
    }

    value += template.slice(cursor, start);
    const fullMatch = template.slice(start, end + 2);
    const key = template.slice(start + 2, end).trim();

    if (key.startsWith("process.env.")) {
      const envVar = key.slice("process.env.".length);
      const resolved = processEnv[envVar];
      if (typeof resolved === "string") {
        value += resolved;
        cursor = end + 2;
        continue;
      }
      throw new Error(`Environment variable ${envVar} is not set`);
    }

    const resolved = context[key];
    if (resolved !== undefined) {
      value += resolved;
      cursor = end + 2;
      continue;
    }

    warnings.push(`Unresolved variable: ${key}`);
    value += fullMatch;
    cursor = end + 2;
  }

  return { value, warnings };
}
