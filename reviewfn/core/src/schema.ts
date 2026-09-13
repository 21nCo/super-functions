import { Ajv } from "ajv";

export const harnessOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requirements", "assessments", "evidence", "findings", "inspectedPaths", "uninspected"],
  properties: {
    requirements: { type: "array", items: { $ref: "#/$defs/requirement" } },
    assessments: { type: "array", items: { $ref: "#/$defs/assessment" } },
    evidence: { type: "array", items: { $ref: "#/$defs/evidence" } },
    findings: { type: "array", items: { $ref: "#/$defs/finding" } },
    inspectedPaths: { type: "array", items: { type: "string" } },
    uninspected: { type: "array", items: { type: "object", additionalProperties: false, required: ["scope", "reason"], properties: { scope: { type: "string" }, reason: { type: "string" } } } },
  },
  $defs: {
    sourceReference: { type: "object", additionalProperties: false, required: ["sourceId", "anchor"], properties: { sourceId: { type: "string" }, anchor: { type: "string" }, excerpt: { type: "string" } } },
    codeAnchor: { type: "object", additionalProperties: false, required: ["commit", "path"], properties: { commit: { type: "string" }, path: { type: "string" }, startLine: { type: "integer", minimum: 1 }, endLine: { type: "integer", minimum: 1 }, symbol: { type: "string" } } },
    requirement: { type: "object", additionalProperties: false, required: ["id", "statement", "sources", "category", "scope", "classification", "dependencies", "extraction"], properties: { id: { type: "string" }, statement: { type: "string" }, sources: { type: "array", minItems: 1, items: { $ref: "#/$defs/sourceReference" } }, category: { enum: ["behavior", "architecture", "compatibility", "test", "migration", "documentation", "non_goal", "other"] }, scope: { type: "string" }, classification: { enum: ["mandatory", "advisory"] }, dependencies: { type: "array", items: { type: "string" } }, ambiguity: { type: "string" }, extraction: { type: "object", additionalProperties: false, required: ["harness", "promptDigest"], properties: { harness: { type: "string" }, promptDigest: { type: "string" } } } } },
    assessment: { type: "object", additionalProperties: false, required: ["requirementId", "status", "evidenceIds", "reasoning", "gaps", "confidence"], properties: { requirementId: { type: "string" }, status: { enum: ["implemented", "partial", "missing", "unverified", "not_applicable"] }, evidenceIds: { type: "array", items: { type: "string" } }, reasoning: { type: "string" }, gaps: { type: "array", items: { type: "string" } }, confidence: { type: "number", minimum: 0, maximum: 1 }, waiverReference: { $ref: "#/$defs/sourceReference" } } },
    evidence: { type: "object", additionalProperties: false, required: ["id", "kind", "description"], properties: { id: { type: "string" }, kind: { enum: ["source", "code", "diff", "test", "artifact"] }, description: { type: "string" }, source: { $ref: "#/$defs/sourceReference" }, code: { $ref: "#/$defs/codeAnchor" }, receiptId: { type: "string" }, artifactDigest: { type: "string" }, sourceExclusionReason: { type: "string", minLength: 1 } } },
    finding: { type: "object", additionalProperties: false, required: ["fingerprint", "severity", "category", "title", "trigger", "impact", "direction", "evidenceIds", "basis", "requirementIds", "lifecycle"], properties: { fingerprint: { type: "string" }, severity: { enum: ["critical", "high", "medium", "low", "info"] }, category: { type: "string" }, title: { type: "string" }, trigger: { type: "string" }, impact: { type: "string" }, direction: { type: "string" }, anchor: { $ref: "#/$defs/codeAnchor" }, evidenceIds: { type: "array", items: { type: "string" } }, basis: { enum: ["reproduced", "inferred"] }, requirementIds: { type: "array", items: { type: "string" } }, lifecycle: { enum: ["new", "still_valid", "resolved", "superseded", "needs_revalidation"] } } },
  },
} as const;

const validator = new Ajv({ allErrors: true, strict: true }).compile(harnessOutputSchema);
export function validateHarnessPayload(value: unknown): string[] {
  return validator(value) ? [] : (validator.errors ?? []).map(error => `${error.instancePath || "/"}: ${error.message}`);
}

/** OpenAI strict structured output requires every property, using null for optional values. */
export function strictProviderSchema(schema: unknown = harnessOutputSchema): unknown {
  if (Array.isArray(schema)) return schema.map(value => strictProviderSchema(value));
  if (!schema || typeof schema !== "object") return schema;
  const input = schema as Record<string, unknown>;
  const output = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, strictProviderSchema(value)]));
  if (input.type === "object" && input.properties) {
    const required = new Set(input.required as string[] ?? []);
    output.properties = Object.fromEntries(Object.entries(input.properties as Record<string, unknown>).map(([key, value]) => [key, required.has(key) ? strictProviderSchema(value) : { anyOf: [strictProviderSchema(value), { type: "null" }] }]));
    output.required = Object.keys(input.properties as object);
  }
  return output;
}
export function omitOptionalNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitOptionalNulls);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null).map(([key, item]) => [key, omitOptionalNulls(item)]));
}
