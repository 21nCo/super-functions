import { ValidationError } from "../core/errors.js";

export interface PromptVariables {
  [key: string]: string | number | boolean | null | undefined;
}

export interface PromptTemplateConfig {
  template: string;
  variables?: string[];
  name?: string;
  version?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

function extractVariables(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (!names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

export class PromptTemplate {
  readonly template: string;
  readonly variables: readonly string[];
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;

  constructor(config: string | PromptTemplateConfig) {
    const resolved = typeof config === "string" ? { template: config } : config;
    this.template = resolved.template;
    this.variables = [...(resolved.variables ?? extractVariables(resolved.template))];
    this.name = resolved.name;
    this.version = resolved.version;
    this.description = resolved.description;
    this.tags = [...(resolved.tags ?? [])];
    this.metadata = { ...(resolved.metadata ?? {}) };
  }

  format(variables: PromptVariables = {}): string {
    const missing = this.variables.filter((name) => !(name in variables));
    if (missing.length) {
      throw new ValidationError(`Missing template variables: ${missing.join(", ")}`, {
        metadata: { missing, variables: [...this.variables] }
      });
    }

    return this.template.replace(PLACEHOLDER, (_, name: string) => String(variables[name]));
  }

  get requiredVariables(): readonly string[] {
    return this.variables;
  }
}
