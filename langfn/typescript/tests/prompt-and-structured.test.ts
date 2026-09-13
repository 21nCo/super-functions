import { describe, expect, it } from "vitest";

import { LangFnError, SchemaValidationError, ValidationError } from "../src/core/errors.js";
import { ChatTemplate } from "../src/prompts/chat_template.js";
import { FewShotPrompt } from "../src/prompts/few-shot.js";
import { PromptRegistry } from "../src/prompts/registry.js";
import { PromptTemplate } from "../src/prompts/template.js";
import { StructuredOutput } from "../src/structured/output.js";

class MemoryAdapter {
  readonly records = new Map<string, Record<string, unknown>>();

  async create(): Promise<void> {}
  async createMany(): Promise<void> {}
  async delete(): Promise<void> {}

  async upsert<T extends Record<string, unknown>>(params: {
    create: T;
  }): Promise<void> {
    this.records.set(String(params.create.id), { ...params.create });
  }

  async findMany<T extends Record<string, unknown>>(params: {
    where?: Array<{ field: string; value: unknown }>;
  }): Promise<T[]> {
    return [...this.records.values()]
      .filter((record) =>
        (params.where ?? []).every((clause) => record[clause.field] === clause.value)
      )
      .map((record) => ({ ...record } as T));
  }

  async findOne<T extends Record<string, unknown>>(params: {
    where?: Array<{ field: string; value: unknown }>;
  }): Promise<T | null> {
    const found = (await this.findMany<T>(params))[0];
    return found ?? null;
  }
}

describe("prompt and structured contract", () => {
  it("renders prompt, chat, and few-shot templates deterministically", () => {
    const prompt = new PromptTemplate("Hello {name}");
    const chat = ChatTemplate.from_messages([["system", "You are a {role}."]]);
    const fewShot = new FewShotPrompt({
      prefix: "Translate",
      examples: [{ input: "Hello", output: "Bonjour" }],
      suffix: "Input: {input}"
    });

    expect(prompt.format({ name: "Alice" })).toBe("Hello Alice");
    expect(chat.formatMessages({ role: "helper" })).toEqual([
      { role: "system", content: "You are a helper." }
    ]);
    expect(fewShot.format({ input: "Goodbye" })).toBe(
      "Translate\n\nInput: Hello\nOutput: Bonjour\n\nInput: Goodbye"
    );
  });

  it("fails missing prompt variables with canonical validation errors", () => {
    const template = new PromptTemplate("Hello {name}");
    expect(() => template.format({})).toThrowError(ValidationError);
  });

  it("parses structured output and surfaces canonical schema details", () => {
    const schema = {
      parse(data: unknown) {
        const candidate = data as Record<string, unknown>;
        if (typeof candidate.label !== "string") {
          throw { issues: [{ path: ["label"], message: "Expected string" }] };
        }
        if (typeof candidate.severity !== "number") {
          throw { issues: [{ path: ["severity"], message: "Expected number" }] };
        }
        return { label: candidate.label, severity: candidate.severity as number };
      }
    };

    const structured = new StructuredOutput(schema);
    expect(structured.parse('prefix {"label":"bug","severity":2} suffix')).toEqual({
      label: "bug",
      severity: 2
    });

    expect(() => structured.parse("no object here")).toThrowError(SchemaValidationError);
    expect(() => structured.parse('{"label":"bug","severity":"high"}')).toThrowError(
      SchemaValidationError
    );
    try {
      structured.parse('{"label":"bug","severity":"high"}');
    } catch (error) {
      expect((error as SchemaValidationError).metadata.errors).toEqual([
        { path: ["severity"], message: "Expected number" }
      ]);
    }
  });

  it("resolves exact and latest prompt registry versions deterministically", async () => {
    const registry = new PromptRegistry(new MemoryAdapter() as never);

    await registry.save(
      "support-reply",
      new PromptTemplate({
        template: "v1",
        metadata: { channel: "email" }
      }),
      {
      version: "1.0.0",
      metadata: { channel: "email" }
      }
    );
    await registry.save("support-reply", new PromptTemplate("v2"), {
      version: "1.1.0"
    });

    const exact = await registry.load("support-reply", { version: "1.0.0" });
    const latest = await registry.load("support-reply", { version: "latest" });
    const listed = await registry.list("support-reply");

    expect(exact.version).toBe("1.0.0");
    expect(exact.metadata.channel).toBe("email");
    expect(latest.version).toBe("1.1.0");
    expect(listed.map((prompt) => prompt.version)).toEqual(["1.1.0", "1.0.0"]);

    await expect(registry.load("support-reply", { version: "9.9.9" })).rejects.toMatchObject({
      code: "NOT_FOUND"
    } satisfies Partial<LangFnError>);
  });
});
