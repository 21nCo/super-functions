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
} from "./schema.js";

export {
  type MutationValidationOpts,
  validateMutation,
  validateMutationBody,
  validatePushMutations,
} from "./mutation.js";

export {
  type QueryValidationLimits,
  validateQuery,
  validateFilters,
  validateQueryBody,
} from "./query.js";

export { type AuthzOptions } from "./authz.js";
