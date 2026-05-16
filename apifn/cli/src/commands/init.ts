import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { writeCollection, type Collection } from "@apifn/collections";
import type { Output } from "../utils/output.js";
import { createInterface } from "node:readline/promises";

async function promptIfNeeded(
  label: string,
  fallback: string,
  shouldPrompt: boolean
): Promise<string> {
  if (!shouldPrompt) {
    return fallback;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${label} (${fallback}): `);
    return answer.trim() || fallback;
  } finally {
    rl.close();
  }
}

export async function runInitCommand(options: {
  dir?: string;
  yes?: boolean;
  force?: boolean;
  cwd?: string;
  output: Output;
}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const dir = path.resolve(cwd, options.dir ?? ".");
  const shouldPrompt = !options.yes;

  const collectionName = await promptIfNeeded("Collection name", "API Collection", shouldPrompt);
  const baseUrl = await promptIfNeeded("Base URL", "http://localhost:3000", shouldPrompt);

  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir);
  if (entries.length > 0 && !options.force) {
    options.output.error(`Directory '${dir}' is not empty. Use --force to initialize anyway.`);
    return 2;
  }

  const collection: Collection = {
    info: { name: collectionName, type: "collection" },
    rootDir: dir,
    environments: {
      development: {
        name: "development",
        variables: { baseUrl },
      },
    },
    items: [
      {
        kind: "folder",
        name: "Sample",
        path: "sample",
        seq: 1,
        children: [
          {
            kind: "request",
            name: "Health Check",
            path: "sample/health-check.yml",
            seq: 1,
            request: {
              info: { name: "Health Check", type: "http", seq: 1 },
              http: {
                method: "GET",
                url: "{{baseUrl}}/health",
              },
            },
          },
        ],
      },
    ],
  };

  await writeCollection(collection);
  options.output.success(`Initialized collection in ${dir}`);
  return 0;
}
