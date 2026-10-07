import { spawnSync } from 'node:child_process';
const commands = [
  ['npm', ['exec', 'turbo', 'run', 'build', '--', '--filter=langfn...']],
  ['npm', ['--prefix', 'langfn/typescript', 'run', 'typecheck']],
  ['npm', ['--prefix', 'langfn/typescript', 'test']],
  [process.execPath, ['--input-type=module', '-e', 'await import("langfn"); await import("langfn/models"); await import("langfn/http"); await import("langfn/mcp");']],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
