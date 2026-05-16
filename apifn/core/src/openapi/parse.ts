import { parse as parseYaml } from "yaml";
import type { OpenAPIDocument } from "../types.js";
import { upconvertFrom3_0 } from "./upconvert.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringInput(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Invalid OpenAPI input: empty string");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    try {
      return parseYaml(trimmed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid OpenAPI input: failed to parse JSON or YAML (${message})`);
    }
  }
}

function normalizeDocument(raw: unknown): OpenAPIDocument {
  if (!isObject(raw)) {
    throw new Error("Invalid OpenAPI document: expected object");
  }

  const version = raw.openapi;
  if (typeof version !== "string") {
    throw new Error("Invalid OpenAPI document: missing openapi version");
  }

  if (version.startsWith("3.0.")) {
    return upconvertFrom3_0(raw);
  }

  if (version !== "3.1.0") {
    throw new Error(`Unsupported OpenAPI version: ${version}`);
  }

  return raw as unknown as OpenAPIDocument;
}

export function parseOpenAPI(input: string | Record<string, unknown>): OpenAPIDocument {
  if (typeof input === "string") {
    const parsed = parseStringInput(input);
    return normalizeDocument(parsed);
  }

  return normalizeDocument(input);
}
