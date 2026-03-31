import { Writable } from "node:stream";

export class InvalidJsonStdinError extends Error {
  readonly code = "CLIFN_INVALID_STDIN_JSON";

  constructor(message: string) {
    super(message);
    this.name = "InvalidJsonStdinError";
  }
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

export async function readJsonStdin<T>(input: NodeJS.ReadableStream = process.stdin): Promise<T> {
  const raw = (await readAll(input)).trim();
  if (raw.length === 0) {
    throw new InvalidJsonStdinError("stdin is empty; expected one JSON document");
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new InvalidJsonStdinError(`stdin contains invalid JSON: ${message}`);
  }
}

export function writeJsonStdout<T>(value: T, output: Writable = process.stdout): void {
  output.write(`${JSON.stringify(value)}\n`);
}
