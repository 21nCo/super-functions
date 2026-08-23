import { spawn } from "node:child_process";

import { createStreamingRedactor } from "./redaction.js";

function requiredJson(name: string): unknown {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing ${name}.`);
  return JSON.parse(raw) as unknown;
}

const command = requiredJson("DEVFN_WRAPPED_COMMAND");
const keys = requiredJson("DEVFN_REDACT_KEYS");
if (!Array.isArray(command) || command.length === 0 || !command.every((item) => typeof item === "string")) throw new Error("Invalid wrapped command.");
if (!Array.isArray(keys) || !keys.every((item) => typeof item === "string")) throw new Error("Invalid redaction keys.");

const environment = { ...process.env };
delete environment.DEVFN_WRAPPED_COMMAND;
delete environment.DEVFN_REDACT_KEYS;
const secrets = [...new Set((keys as string[]).map((key) => environment[key]).filter((value): value is string => typeof value === "string" && value.length > 0))].sort((a, b) => b.length - a.length);
const child = spawn(command[0], command.slice(1), { cwd: process.cwd(), env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

function pipeRedacted(stream: NodeJS.ReadableStream, destination: NodeJS.WritableStream): void {
  if (secrets.length === 0) { stream.pipe(destination, { end: false }); return; }
  const redactor = createStreamingRedactor(secrets, (value) => destination.write(value));
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => redactor.push(chunk));
  stream.on("end", () => redactor.end());
}

pipeRedacted(child.stdout!, process.stdout);
pipeRedacted(child.stderr!, process.stderr);
child.once("error", (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.once("close", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
