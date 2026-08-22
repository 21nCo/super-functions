import type { ProcessSpec } from "@devfn/config";

export function resolveAdapterCommand(spec: ProcessSpec): string[] {
  const extra = spec.command ?? [];
  switch (spec.adapter) {
    case "command": return [...extra];
    case "npm": return ["npm", "run", spec.script!, ...(extra.length ? ["--", ...extra] : [])];
    case "pnpm": return ["corepack", "pnpm", "run", spec.script!, ...extra];
    case "turbo": return ["npm", "exec", "--offline", "--", "turbo", ...extra];
    case "wrangler": return ["npm", "exec", "--offline", "--", "wrangler", ...(extra.length ? extra : ["dev"] )];
    case "xcode": return ["xcodebuild", ...extra];
    case "extfn": return ["npm", "exec", "--offline", "--", "extfn", ...(extra.length ? extra : ["dev"] )];
    default: {
      const unsupported: never = spec.adapter;
      throw new Error(`Unsupported process adapter: ${String(unsupported)}`);
    }
  }
}

const BASE_ENV = ["PATH", "SHELL", "HOME", "USER", "LOGNAME", "TMPDIR", "TMP", "TEMP", "SystemRoot", "ComSpec", "PATHEXT"] as const;

export function createProcessEnvironment(spec: ProcessSpec, generated: Record<string, string> = {}, source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of [...BASE_ENV, ...(spec.envAllowlist ?? [])]) if (source[key] !== undefined) result[key] = source[key];
  Object.assign(result, generated, spec.env ?? {});
  if (spec.exposure !== "public") {
    result.HOST = "127.0.0.1";
    result.DEVFN_HOST = "127.0.0.1";
  }
  return result;
}
