import type { Adapter, WhereClause } from "@superfunctions/db";

import { LangFnError, ValidationError } from "../core/errors.js";
import { PromptTemplate } from "./template.js";

export interface PromptRecord {
  id: string;
  name: string;
  version: string;
  template: string;
  variables: string[];
  description?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

function parseSemver(version: string): [number, number, number] {
  const parts = version.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new ValidationError("Prompt registry versions must be semantic versions", {
      metadata: { version }
    });
  }
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

function promptSortKey(record: PromptRecord): [number, number, number, number] {
  const [major, minor, patch] = parseSemver(record.version);
  return [major, minor, patch, record.updatedAt];
}

export class PromptRegistry {
  private readonly tableName = "langfn_prompts";

  constructor(private readonly db: Adapter) {}

  async save(
    name: string,
    prompt: PromptTemplate,
    options: {
      version: string;
      description?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): Promise<PromptTemplate> {
    parseSemver(options.version);
    const now = Date.now();
    const record: PromptRecord = {
      id: `${name}:${options.version}`,
      name,
      version: options.version,
      template: prompt.template,
      variables: [...prompt.requiredVariables],
      description: options.description ?? prompt.description,
      tags: [...(options.tags ?? prompt.tags)],
      metadata: { ...(options.metadata ?? prompt.metadata) },
      createdAt: now,
      updatedAt: now
    };

    await this.db.upsert({
      model: this.tableName,
      where: [{ field: "id", operator: "eq", value: record.id }] as WhereClause[],
      create: record,
      update: record
    });

    return toPromptTemplate(record);
  }

  async load(name: string, options: { version?: string } = {}): Promise<PromptTemplate> {
    const version = options.version ?? "latest";
    const record =
      version === "latest" ? await this.loadLatest(name) : await this.loadExact(name, version);

    if (!record) {
      throw new LangFnError(`Prompt not found: ${name}@${version}`, {
        code: "NOT_FOUND",
        metadata: { name, version }
      });
    }

    return toPromptTemplate(record);
  }

  async list(name?: string): Promise<PromptTemplate[]> {
    const where = name
      ? ([{ field: "name", operator: "eq", value: name }] as WhereClause[])
      : undefined;
    const records = await this.db.findMany<PromptRecord>({
      model: this.tableName,
      where: where ?? []
    });

    return [...records]
      .filter((record) => {
        try {
          parseSemver(record.version);
          return true;
        } catch {
          return false;
        }
      })
      .sort((left, right) => comparePromptRecords(right, left))
      .map(toPromptTemplate);
  }

  private async loadExact(name: string, version: string): Promise<PromptRecord | null> {
    parseSemver(version);
    return await this.db.findOne<PromptRecord>({
      model: this.tableName,
      where: [{ field: "id", operator: "eq", value: `${name}:${version}` }] as WhereClause[]
    });
  }

  private async loadLatest(name: string): Promise<PromptRecord | null> {
    const records = await this.db.findMany<PromptRecord>({
      model: this.tableName,
      where: [{ field: "name", operator: "eq", value: name }] as WhereClause[]
    });
    const valid = records.filter((record) => {
      try {
        parseSemver(record.version);
        return true;
      } catch {
        return false;
      }
    });
    if (!valid.length) {
      return null;
    }
    valid.sort((left, right) => comparePromptRecords(right, left));
    return valid[0];
  }
}

function comparePromptRecords(left: PromptRecord, right: PromptRecord): number {
  const leftKey = promptSortKey(left);
  const rightKey = promptSortKey(right);
  for (let index = 0; index < leftKey.length; index += 1) {
    if (leftKey[index] > rightKey[index]) return 1;
    if (leftKey[index] < rightKey[index]) return -1;
  }
  return 0;
}

function toPromptTemplate(record: PromptRecord): PromptTemplate {
  return new PromptTemplate({
    template: record.template,
    variables: record.variables,
    name: record.name,
    version: record.version,
    description: record.description,
    tags: record.tags,
    metadata: record.metadata
  });
}
