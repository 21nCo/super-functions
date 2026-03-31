import { parseArgs } from "node:util";
import { runParsedFixture, type ParserFixtureResult } from "../shared.js";

export async function runParseArgsFixture(argv: string[]): Promise<ParserFixtureResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      name: {
        type: "string",
      },
      quiet: {
        type: "boolean",
      },
      verbose: {
        type: "boolean",
      },
      json: {
        type: "boolean",
      },
    },
  });

  if (positionals[0] !== "greet") {
    throw new Error("parseArgs canary expects the greet command.");
  }

  return runParsedFixture("parseArgs", values.name ?? "world", {
    quiet: values.quiet,
    verbose: values.verbose,
    json: values.json,
  });
}
