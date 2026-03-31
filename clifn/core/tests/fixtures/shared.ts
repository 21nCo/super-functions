import { runAction } from "../../src/runner.js";

export interface ParserFixtureGlobals {
  quiet?: boolean;
  verbose?: boolean;
  json?: boolean;
}

export interface ParserFixtureResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runParsedFixture(
  parser: "commander" | "cac" | "parseArgs",
  name: string,
  globals: ParserFixtureGlobals = {}
): Promise<ParserFixtureResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runAction(
    async (options: { name: string }, ctx) => {
      ctx.output.debug(`parser ${parser}`);

      if (globals.json) {
        return {
          data: {
            ok: true,
            parser,
            name: options.name,
          },
        };
      }

      ctx.output.info(`hello ${options.name} from ${parser}`);
      return undefined;
    },
    { name },
    {
      cwd: "repo root",
      nonInteractive: true,
      color: false,
      quiet: globals.quiet,
      verbose: globals.verbose,
      mode: globals.json ? "json" : "text",
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    }
  );

  return {
    exitCode,
    stdout: stdout.join(""),
    stderr: stderr.join(""),
  };
}
