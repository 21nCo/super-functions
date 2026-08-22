# DevFn configuration reference

DevFn discovers `devfn.config.ts`, `.js`, `.mjs`, `.cjs`, or `.json` while walking upward from the current directory. JavaScript-family manifests are executable code, require digest-bound trust, and must be self-contained (no imports or `require()`). JSON is data-only.

## Top-level manifest

| Field | Required | Meaning |
| --- | --- | --- |
| `version: 1` | yes | Manifest schema version. |
| `project.id` | yes | Stable semantic project identity. |
| `project.name` | no | Human display name. |
| `defaultProfile` | no | Profile selected when `--profile` is omitted. Without it, a `profiles.default` entry is required. |
| `runtimeDir` | no | Repository-relative generated-state root; defaults to `.devfn`. |
| `ports` | no | Named `PortSpec` map. |
| `processes` | no | Named native process map. |
| `services` | no | Named Docker Compose service map. |
| `profiles` | yes | Named selections of processes/services plus non-secret environment and proxy choice. |
| `hostnames` | no | Explicit local hostname routes to named ports. |
| `prerequisites` | no | Required command/version diagnostics, optionally profile-scoped. |
| `environmentOutputs` | no | Repository-relative dotenv or JSON runtime files and owner-only permission modes. |
| `policy` | no | Repository-relative organization policy JSON path. |

Every repository-relative path rejects absolute paths, `..` escape, and runtime symlink escape. References to ports, processes, services, profiles, dependencies, and hostname targets must resolve during validation. An explicitly configured but missing policy is an error; only the conventional unconfigured policy path is optional.

## Ports

A port can specify `protocol` (`tcp` or `udp`), `preferred`, `range: [start, end]`, `exact`, `ephemeral`, `exposure` (`loopback` or `public`), conventional container `internal` port, contiguous `block` name, and exported `env` key.

- `exact: true` requires `preferred` and fails closed on collision.
- `ephemeral: true` cannot be combined with fixed preferences.
- Requirements sharing `block` receive a contiguous allocation.
- Public ports require `devfn up --allow-public`.

## Native processes

`adapter` is one of `command`, `npm`, `pnpm`, `turbo`, `wrangler`, `xcode`, or `extfn`. A process can specify `command`, package-manager `script`, repository-relative `cwd`, non-secret literal `env`, inherited `envAllowlist`, redacted `secretEnv`, named `ports`, `dependsOn`, `health`, `shutdownTimeoutMs`, and `exposure` (`local` or `public`).

Turbo, Wrangler, and ExtFn resolve project-local binaries with offline npm execution; pnpm runs through Corepack so the repository's `packageManager` pin is honored. Adapters never download a missing tool during startup. `doctor` reports the missing prerequisite instead. Discovery marks Yarn and Bun as proposed and emits no guessed npm process; add an explicit command adapter after review.

Sensitive-looking keys cannot be literal manifest values. They must be inherited by name in `envAllowlist` and repeated in `secretEnv`, which activates streaming redaction before logs are persisted. This is a key-name safeguard, not general secret detection; reviewers must inspect all other literal values. Public processes require `--allow-public`.

## Compose services

A service uses `adapter: "compose"`, Compose `service`, optional repository-relative `file`, project-name prefix, named host-port-to-container-port mappings, dependencies, health, `persistent`, non-secret `env`, `envAllowlist`, and `secretEnv`. DevFn always adds the worktree instance suffix to the Compose project name.

DevFn writes a generated override with loopback host mappings unless the named port explicitly selects public exposure. It starts only the requested service with `--no-deps`. Services declaring `secretEnv` use Docker's `none` logging driver and therefore cannot use log-pattern health checks. Ordinary cleanup stops/removes only invocation-owned containers and never passes a volume-deletion flag.

## Health checks

- HTTP: `{ type: "http", port: "app", path: "/health", expectedStatus: 200, timeoutMs: 120000 }`
- TCP: `{ type: "tcp", port: "postgres" }`
- Command: `{ type: "command", command: ["node", "scripts/ready.mjs"] }`
- Log: `{ type: "log", pattern: "ready on" }`

HTTP URLs are returned only for explicitly routed hostnames or ports named by HTTP health checks. Other services remain transport allocations visible through `devfn ports`; DevFn does not invent an HTTP URL for a database or arbitrary TCP listener.

## Profiles and hostnames

Profiles select named processes/services, add non-secret environment, and opt into the shared proxy with `proxy: true`. Dependencies are included transitively and started topologically. Cycles fail before mutation.

A hostname maps a route name to `target`, optional `hostname` template, `tls` (`off` or `internal`), and optional `profiles` filter. Templates accept `{project}` and `{instance}`. Every resolved name must end in `.localhost`.

## Organization policy

`devfn.policy.json` supports `fallbackRange`, `hostnameSuffix`, and entries with `name`, exactly one of `port`/`range`, `kind` (`protected`, `preferred`, or `excluded`), optional `project`, and `description`. `devfn ports report` combines the policy with the entire machine registry into Markdown; it is not limited to the current project or profile. `--output` must remain inside the repository.
