import { devNull } from "node:os";

/** Host Git subprocesses must not inherit credentials or external global filters. */
export function isolatedGitEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { PATH: source.PATH, SystemRoot: source.SystemRoot, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: devNull, GIT_ATTR_NOSYSTEM: "1" };
}
