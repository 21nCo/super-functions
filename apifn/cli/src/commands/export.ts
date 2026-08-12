import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify as toYaml } from "yaml";
import { parseOpenAPI } from "@apifn/core";
import type { ApifnConfig } from "../config.js";
import type { Output } from "../utils/output.js";

export async function runExportCommand(options: {
  format?: "yaml" | "json";
  outputPath?: string;
  inputPath?: string;
  cwd?: string;
  config: ApifnConfig;
  output: Output;
}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const format = options.format ?? "yaml";
  const inputPath = options.inputPath
    ? path.resolve(cwd, options.inputPath)
    : path.resolve(cwd, options.config.output ?? ".apifn", "openapi.yml");

  const raw = await readFile(inputPath, "utf8");
  const parsed = parseOpenAPI(raw);
  const rendered = format === "json" ? JSON.stringify(parsed, null, 2) : toYaml(parsed);

  if (options.outputPath) {
    const resolvedOutput = path.resolve(cwd, options.outputPath);
    await mkdir(path.dirname(resolvedOutput), { recursive: true });
    await writeFile(resolvedOutput, rendered, "utf8");
    options.output.success(`Exported ${format} spec -> ${resolvedOutput}`);
    return;
  }

  options.output.info(rendered);
}
