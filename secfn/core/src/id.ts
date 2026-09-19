import { randomBytes, randomUUID } from "node:crypto";

export function generateId(prefix: string): string {
  if (typeof randomUUID === "function") {
    return `${prefix}_${randomUUID().replaceAll("-", "")}`;
  }
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
