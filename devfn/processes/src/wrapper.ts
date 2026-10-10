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

// The supervisor opens this gate only after it recorded this process's
// identity. If it dies first, the channel closes and the command never runs,
// so a launch without a recorded identity proves nothing of it started.
// Without the channel there is no gate, so the command never runs.
if (!process.send) {
  process.stderr.write("The DevFn process wrapper requires its launch gate channel.\n");
  process.exit(1);
}
const opened = await new Promise<boolean>((resolve) => {
  process.once("message", (message) => resolve(message === "start"));
  process.once("disconnect", () => resolve(false));
});
process.removeAllListeners("message");
process.removeAllListeners("disconnect");
if (!opened) process.exit(1);
process.disconnect();

const drainMs = Number(process.env.DEVFN_WRAPPER_DRAIN_MS ?? Number.NaN);
const environment = { ...process.env };
delete environment.DEVFN_WRAPPED_COMMAND;
delete environment.DEVFN_REDACT_KEYS;
delete environment.DEVFN_WRAPPER_DRAIN_MS;
const secrets = [...new Set((keys as string[]).map((key) => environment[key]).filter((value): value is string => typeof value === "string" && value.length > 0))].sort((a, b) => b.length - a.length);
const child = spawn(command[0], command.slice(1), { cwd: process.cwd(), env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

/** Forward output, redacted; the returned function flushes what is held back. */
function pipeRedacted(stream: NodeJS.ReadableStream, destination: NodeJS.WritableStream): () => void {
  if (secrets.length === 0) { stream.pipe(destination, { end: false }); return () => undefined; }
  const redactor = createStreamingRedactor(secrets, (value) => destination.write(value));
  let ended = false;
  const end = () => { if (!ended) { ended = true; redactor.end(); } };
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => redactor.push(chunk));
  stream.on("end", end);
  return end;
}

const flushes = [pipeRedacted(child.stdout!, process.stdout), pipeRedacted(child.stderr!, process.stderr)];
const finish = (code: number | null, signal: NodeJS.Signals | null) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
};
let closed = false;
child.once("error", (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.once("close", (code, signal) => { closed = true; finish(code, signal); });
// A process the command left behind can hold its output open after the
// command exits. With a drain limit the wrapper then stops waiting for that
// output and exits, so its caller can stop what remains of its group.
if (Number.isInteger(drainMs) && drainMs >= 0) {
  child.once("exit", (code, signal) => {
    setTimeout(() => {
      if (closed) return;
      child.stdout!.destroy();
      child.stderr!.destroy();
      for (const flush of flushes) flush();
      finish(code, signal);
    }, drainMs).unref();
  });
}
