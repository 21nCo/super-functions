/**
 * Validation module exports
 */

export {
  type ValidationError,
  type ValidationResult,
  type SchemaIndex,
  vOk,
  vErr,
  buildSchemaIndex,
  getResource,
  validateFieldName,
  validateWritableField,
  validateRelationName,
  validateRecordKeys,
  isFieldOrRelation,
  getRelationTarget,
  getRelation,
  joinPath,
  SYSTEM_FIELDS,
  READONLY_SYSTEM_FIELDS,
} from "./schema.js";

export {
  validateMutation,
  validateMutationBody,
  validatePushMutations,
} from "./mutation.js";

export {
  validateQuery,
  validateFilters,
  validateQueryBody,
} from "./query.js";
