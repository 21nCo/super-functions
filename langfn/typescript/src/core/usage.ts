import { LangFnError } from "./errors.js";
import { tokenUsage } from "./types.js";

/** Missing counters are unknown, never zero-priced usage. */
export function providerUsage(
  prompt: unknown,
  completion: unknown,
  total?: unknown,
) {
  const counts =
    total === undefined ? [prompt, completion] : [prompt, completion, total];
  if (
    !counts.every(
      (value) =>
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    )
  ) {
    throw new LangFnError("Provider reported invalid token usage", {
      code: "INVALID_TOKEN_USAGE",
    });
  }
  const usage = tokenUsage(prompt as number, completion as number);
  if (!Number.isSafeInteger(usage.total_tokens))
    throw new LangFnError("Provider reported invalid token usage", {
      code: "INVALID_TOKEN_USAGE",
    });
  if (total !== undefined)
    usage.total_tokens = usage.totalTokens = total as number;
  return usage;
}
