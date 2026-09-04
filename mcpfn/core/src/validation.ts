import type { ErrorObject } from "ajv";

import { compareCodeUnits } from "./canonical.js";

export const MCPFN_MAX_VALIDATION_ISSUES = 32;

export type McpFnLifecycleStage =
  | "profile_resolution"
  | "catalog_projection"
  | "call_enrichment"
  | "input_validation"
  | "handler"
  | "output_validation";

export interface McpFnValidationIssue {
  path: string;
  schemaPath: string;
  keyword: string;
  message: string;
  rejectedProperty?: string;
  missingProperty?: string;
}

export interface McpFnValidationLifecycle {
  stage: McpFnLifecycleStage;
  profileId: string;
  profileVersion: string;
  tool?: string;
}

export function formatValidationIssues(
  errors: ErrorObject[] | null | undefined,
): McpFnValidationIssue[] {
  const issues = (errors ?? []).map((error) => {
    const params = error.params as Record<string, unknown> | undefined;
    const rejectedProperty = typeof params?.additionalProperty === "string"
      ? params.additionalProperty
      : undefined;
    const missingProperty = typeof params?.missingProperty === "string"
      ? params.missingProperty
      : undefined;
    const issue: McpFnValidationIssue = {
      path: error.instancePath || "/",
      schemaPath: error.schemaPath || "#",
      keyword: error.keyword,
      message: error.message ?? "Schema validation failed",
    };
    if (rejectedProperty) issue.rejectedProperty = rejectedProperty;
    if (missingProperty) issue.missingProperty = missingProperty;
    return issue;
  });
  issues.sort((left, right) =>
    compareCodeUnits(left.path, right.path) ||
    compareCodeUnits(left.schemaPath, right.schemaPath) ||
    compareCodeUnits(left.keyword, right.keyword) ||
    compareCodeUnits(left.rejectedProperty ?? "", right.rejectedProperty ?? "") ||
    compareCodeUnits(left.missingProperty ?? "", right.missingProperty ?? ""),
  );
  return issues.slice(0, MCPFN_MAX_VALIDATION_ISSUES);
}
