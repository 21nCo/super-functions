import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseOpenAPI, validateOpenAPI } from "@apifn/core";
import type { Output } from "../utils/output.js";

export async function runValidateCommand(options: {
  specPath: string;
  format?: "text" | "json";
  cwd?: string;
  output: Output;
  writeStdout?: (text: string) => void;
}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const specPath = path.resolve(cwd, options.specPath);
  const format = options.format ?? "text";
  const write = options.writeStdout ?? ((text: string) => process.stdout.write(text));

  try {
    const raw = await readFile(specPath, "utf8");
    const parsed = parseOpenAPI(raw);
    const errors = await validateOpenAPI(parsed);

    if (format === "json") {
      write(
        `${JSON.stringify(
          {
            ok: errors.length === 0,
            errors,
          },
          null,
          2,
        )}\n`,
      );
    } else if (errors.length === 0) {
      options.output.success("OpenAPI document is valid.");
    } else {
      for (const error of errors) {
        options.output.error(`${error.path}: ${error.message}`);
      }
    }

    return errors.length === 0 ? 0 : 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (format === "json") {
      write(
        `${JSON.stringify(
          {
            ok: false,
            errors: [{ path: "", message }],
          },
          null,
          2,
        )}\n`,
      );
    } else {
      options.output.error(`Failed to validate spec: ${message}`);
    }
    return 2;
  }
}
