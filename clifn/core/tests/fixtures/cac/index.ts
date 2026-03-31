import { cac } from "cac";
import { runParsedFixture, type ParserFixtureResult } from "../shared.js";

interface CacOptions {
  name?: string;
  quiet?: boolean;
  verbose?: boolean;
  json?: boolean;
}

export async function runCacFixture(argv: string[]): Promise<ParserFixtureResult> {
  const cli = cac("clifn-cac-canary");
  let pending: Promise<ParserFixtureResult> | undefined;
  const fallback: ParserFixtureResult = {
    exitCode: 0,
    stdout: "",
    stderr: "",
  };

  cli.option("--quiet", "Suppress non-error output");
  cli.option("--verbose", "Show debug output");
  cli.option("--json", "Emit newline-terminated JSON");
  cli
    .command("greet")
    .option("--name <name>", "Name to greet")
    .action(async (options: CacOptions) => {
      pending = runParsedFixture("cac", options.name ?? "world", options);
      return pending;
    });

  cli.parse(["node", "clifn-cac-canary", ...argv], { run: true });
  return pending ? await pending : fallback;
}
