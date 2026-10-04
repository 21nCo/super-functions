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

Local-process exposure verification requires `lsof` on macOS and Linux; Windows uses `netstat`. Run `devfn doctor` before startup to detect a missing listener-inspection tool.

Sensitive-looking keys cannot be literal manifest values. They must be inherited by name in `envAllowlist` and repeated in `secretEnv`, which activates streaming redaction before logs are persisted. URL userinfo is also rejected in resolved literals, argv and health URLs; reviewers must inspect other literal formats. Public processes require `--allow-public`.

## Compose services

A service uses `adapter: "compose"`, Compose `service`, optional repository-relative `file`, project-name prefix, named host-port-to-container-port mappings, dependencies, health, `persistent`, non-secret `env`, `envAllowlist`, and `secretEnv`. DevFn always adds the worktree instance suffix to the Compose project name.

DevFn writes a generated override with loopback host mappings unless the named port explicitly selects public exposure. It starts only the requested service with `--no-deps`. Services declaring `secretEnv` use Docker's `none` logging driver and therefore cannot use log-pattern health checks. Ordinary cleanup stops/removes only invocation-owned containers and never passes a volume-deletion flag.

## Health checks

- HTTP: `{ type: "http", port: "app", path: "/health", expectedStatus: 200, timeoutMs: 120000 }`
- TCP: `{ type: "tcp", port: "postgres" }`
- Command: `{ type: "command", command: ["node", "scripts/ready.mjs"] }`
- Log: `{ type: "log", pattern: "ready on" }`

HTTP URLs are returned only for explicitly routed hostnames or ports named by HTTP health checks. Other services remain transport allocations visible through `devfn ports`; DevFn does not invent an HTTP URL for a database or arbitrary TCP listener.

## Startup endpoint and template resolution

`@devfn/core` exports `resolveEndpointTemplates({ config, plan, ownerId, ports, composeNetworks? })`. It is a pure resolver: `ownerId` is an opaque lifecycle owner supplied by the caller, and `ports` contains the selected profile's leased port numbers. `composeNetworks` maps selected service names to effective Docker network names. Supply it to publish Compose DNS URLs; absent network evidence omits those URLs and rejects references to them. The orchestrator reads the effective networks from `docker compose config` before creating state. It returns generated values, the profile environment, direct URLs, and resolved environment and command arguments for each selected node. The current CLI supplies its existing worktree instance ID as the owner. Callers of the resolver may use more than one owner per checkout. The resolver does not derive an owner from a path or start resources.

For each selected port, DevFn generates `DEVFN_PORT_<NAME>` (uppercase, punctuation replaced by `_`) and its configured `ports.<name>.env` alias. An HTTP health port, or a selected proxy hostname target, also gets `DEVFN_URL_<NAME>` as a direct loopback endpoint for host processes and owner-only output files. For Compose services on the same Compose project network, that key instead names the sibling service and its internal port, such as `http://web:8080`; `composeUrls` exposes these container-context values separately from `directUrls`. The leased host port remains in `DEVFN_PORT_<NAME>`. A route's HTTPS setting does not change its direct HTTP upstream; an explicitly direct HTTPS health endpoint retains HTTPS. Once all nodes are ready, the receipt's public `urls` may prefer installed proxy routes. A TCP or UDP allocation without an HTTP declaration has no invented URL.

Precedence is: generated reserved values, then profile literals, then process or service literals. A process or service literal with the same exact key as a profile literal wins for that node; differently cased keys that collide after case folding are rejected. Selected inherited keys and platform base keys follow the same case-folded collision rule before startup, so macOS, Linux and Windows resolve the same map. Profile references resolve against generated and profile values before node overrides, so a node override does not retroactively change another profile value. The generated `DEVFN_*` namespace is reserved. `HOST` is reserved in profiles and local native processes: a local native process always receives `HOST=DEVFN_HOST=127.0.0.1`. An explicitly public native process may set or inherit `HOST` after public exposure is authorized. A Compose service may set `HOST` to its container bind address, including `0.0.0.0`. Local native node values, command argv and command-health argv may reference either generated bind key. These local process bind keys are not profile or Compose template inputs. Port environment aliases cannot use reserved keys. Colliding normalized port keys are rejected. The owner-only environment output file contains the resolved profile and generated non-secret values; node-specific values go only to that node.

Use `{{env.NAME}}` to refer explicitly to a generated or previously declared environment key in a profile value, node value, process `command` argument, package-manager `script`, or command-health argument. References inside each environment map may be forward references; cycles and missing references fail before any lease, file, process, or service mutation, including when a generated port alias shadows a literal. Profile values can refer to generated values; node values and argv can also refer to resolved profile and node values. Compose node references use the container-context URL for sibling services. Inherited `envAllowlist` values are delivered only through the existing process or Compose secret channel and cannot be template sources. Sensitive keys must be declared in `secretEnv`; credential values must not be placed in literals or argv. Empty or NUL argv values and malformed `{{...}}` references are rejected for all selected command sources. All other characters, including `$`, backticks, semicolons, pipes and ampersands, stay literal argv data; DevFn does not invoke a shell.

HTTP readiness that names a leased `port` probes its direct loopback URL at startup, status and retry, even when a `url` is also configured. The configured URL's path and query are retained; an HTTPS proxy route uses its direct HTTP upstream, while a genuinely direct HTTPS endpoint keeps HTTPS. A separate `path` is appended by the existing URL path rule. URL-only readiness remains an explicit URL check, except that a URL aimed at a selected proxy route is rejected before startup: that route is installed only after nodes are ready. Compose interpolation receives the same resolved generated, profile and service values before `docker compose up`; Compose files must explicitly map those values into container `environment` entries when the container needs them. Each Compose service receives container-context sibling URLs only for services in the same owner-specific project with a shared effective Compose network. The default network counts when Compose assigns it; disjoint explicit networks and network namespace modes do not provide sibling DNS. Independent projects are allowed; an unreachable reference is rejected before mutation. An unmanaged pre-existing container is reused only when its effective environment matches the current Compose configuration, allowing only unchanged image defaults beyond the current keys; removed generated, profile, and service literals are rejected before startup. A native dependent can use a Compose service's leased host URL after that service becomes ready. URL userinfo and sensitive query or fragment keys in manifest environment, argv, or effective health URLs are rejected without printing credentials, as are credential argv flags such as `--token`. Aliases `key`, `pass`, `pwd`, `auth`, `sig`, `token`, `secret`, `password`, and `credential` are sensitive at separator or camel/acronym boundaries, including qualified forms such as `db_password`, `DB_PASS`, and `DBSig`. Compact forms use the documented qualifiers in the core package README; ordinary words such as `monkey` and `compass` remain data. Pass credentials through `envAllowlist` and `secretEnv`. A ready receipt also records only a digest of the Compose source and effective configuration (including interpolated environment and command); changing either degrades status and causes a safe owned restart on retry.

## Profiles and hostnames

Profiles select named processes/services, add non-secret environment, and opt into the shared proxy with `proxy: true`. Dependencies are included transitively and started topologically. Cycles fail before mutation.

A hostname maps a route name to `target`, optional `hostname` template, `tls` (`off` or `internal`), and optional `profiles` filter. Templates accept `{project}` and `{instance}`. The route uses a stable DNS-safe component derived from an opaque owner; owners differing only by case receive distinct route names; the original owner value remains in ownership records and `DEVFN_INSTANCE_ID`. Every resolved name must end in `.localhost`.

## Organization policy

`devfn.policy.json` supports `fallbackRange`, `hostnameSuffix`, and entries with `name`, exactly one of `port`/`range`, `kind` (`protected`, `preferred`, or `excluded`), optional `project`, and `description`. `devfn ports report` combines the policy with the entire machine registry into Markdown; it is not limited to the current project or profile. `--output` must remain inside the repository.
