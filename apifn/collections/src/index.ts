// @apifn/collections — public API

export type {
  Collection,
  CollectionInfo,
  CollectionItem,
  OpenCollectionRequest,
  Environment,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  CookieJar,
  CookieJarCookie,
  HttpRedirectRecord,
  RunOptions,
  RunReport,
  RequestResult,
  AssertionResult,
  RunReporter,
  CollectionGenerateOptions,
  RouterCollectionOptions,
} from "./types.js";

export { readCollection } from "./reader.js";
export { writeCollection } from "./writer.js";
export { validateCollection } from "./validator.js";
export { openAPIToCollection, routerToCollection } from "./generator.js";
export {
  readEnvironmentFile,
  writeEnvironmentFile,
  readEnvironments,
  writeEnvironments,
  selectEnvironment,
} from "./environment.js";
export {
  interpolateVariables,
  resolveVariableContext,
  loadDotEnvFile,
} from "./variables.js";
export type { InterpolationResult, VariableResolutionInput } from "./variables.js";
export { createCookieJar, createFetchHttpClient } from "./runner/http-client.js";
export { runCollection } from "./runner/runner.js";
export { createAssertionRuntime } from "./runner/assertions.js";
export {
  executePreRequestScript,
  executeTestScript,
  SCRIPT_TIMEOUT_MS,
} from "./runner/script-sandbox.js";
export { buildRunReport } from "./report.js";
export { createConsoleReporter } from "./runner/reporters/console.js";
export type { ConsoleReporterOptions } from "./runner/reporters/console.js";
export { createJsonReporter } from "./runner/reporters/json.js";
export type { JsonReporterOptions } from "./runner/reporters/json.js";
export { createJUnitReporter, reportToJUnitXml } from "./runner/reporters/junit.js";
export type { JUnitReporterOptions } from "./runner/reporters/junit.js";
export { createSilentReporter } from "./runner/reporters/silent.js";
