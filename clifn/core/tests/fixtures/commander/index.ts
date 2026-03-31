import { Command, CommanderError } from "commander";
import { runParsedFixture, type ParserFixtureResult } from "../shared.js";

interface CommanderGlobals {
  quiet?: boolean;
  verbose?: boolean;
  json?: boolean;
}

export async function runCommanderFixture(argv: string[]): Promise<ParserFixtureResult> {
  const program = new Command();
  let result: ParserFixtureResult = {
    exitCode: 0,
    stdout: "",
    stderr: "",
  };

  program.name("clifn-commander-canary").exitOverride();
  program.option("--quiet", "Suppress non-error output");
  program.option("--verbose", "Show debug output");
  program.option("--json", "Emit newline-terminated JSON");
  program
    .command("greet")
    .option("--name <name>", "Name to greet", "world")
    .action(async (options: { name: string }, command: Command) => {
      const globals = (command.parent?.opts() ?? {}) as CommanderGlobals;
      result = await runParsedFixture("commander", options.name, globals);
    });

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      result = {
        exitCode: error.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } else {
      throw error;
    }
  }

  return result;
}
