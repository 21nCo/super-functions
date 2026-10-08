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

Sensitive-looking keys cannot be literal manifest values. Numbered keys such as `API_TOKEN2` and compact names ending in an unambiguous credential word such as `MYPASSWORD`, `GITHUBTOKEN`, `MYAPIKEY`, or `MYACCESSKEY` follow the same rule. They must be inherited by name in `envAllowlist` and repeated in `secretEnv`, which activates streaming redaction before logs are persisted. PostgreSQL `PGPASSWORD` and qualified `pg_pass`/`pg_pwd` casing variants follow this rule. URL userinfo and credential-bearing headers such as `Authorization: Bearer` are rejected in resolved literals and argv, including when assembled from templates. Curl short-option clusters and cookie assignments receive the same validation; ordinary `--cookie theme=dark` and `--cookie=theme=dark` values are allowed. Public processes require `--allow-public`.

## Compose services

A service uses `adapter: "compose"`, Compose `service`, optional repository-relative `file`, project-name prefix, named host-port-to-container-port mappings, dependencies, health, `persistent`, non-secret `env`, `envAllowlist`, and `secretEnv`. DevFn adds a digest of the exact project prefix and opaque owner to the Compose project name, keeping separate accepted prefixes and owners isolated.

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

Generated reserved values cannot be overridden. Profile literals establish defaults; a process or service literal with the same exact key wins for that node. Differently cased keys that collide after case folding are rejected. Selected inherited keys and platform base keys follow the same case-folded collision rule before startup, so macOS, Linux and Windows resolve the same map. Profile references resolve against generated and profile values before node overrides, so a node override does not retroactively change another profile value. The generated `DEVFN_*` namespace is reserved. `HOST` is reserved in profiles and local native processes: a local native process always receives `HOST=DEVFN_HOST=127.0.0.1`. An explicitly public native process may set or inherit `HOST` after public exposure is authorized. A Compose service may set `HOST` to its container bind address, including `0.0.0.0`. Local native node values, command argv and command-health argv may reference either generated bind key. These local process bind keys are not profile or Compose template inputs. Port environment aliases cannot use reserved keys. Colliding normalized port keys are rejected. The owner-only environment output file contains the resolved profile and generated non-secret values; node-specific values go only to that node.

Use `{{env.NAME}}` to refer explicitly to a generated or previously declared environment key in a profile value, node value, process `command` argument, package-manager `script`, or command-health argument. References inside each environment map may be forward references; cycles and missing references fail before any lease, file, process, or service mutation, while a self-reference to a generated port alias resolves to its generated value. Profile values can refer to generated values; node values and argv can also refer to resolved profile and node values. Compose service environment references use the container-context URL for sibling services; Compose command-health argv runs on the host and uses host-side direct URLs. Inherited `envAllowlist` values are delivered only through the existing process or Compose secret channel and cannot be template sources. Sensitive keys must be declared in `secretEnv`; credential values must not be placed in literals or argv. Empty or NUL argv values and malformed `{{...}}` references are rejected for all selected command sources. All other characters, including `$`, backticks, semicolons, pipes and ampersands, stay literal argv data; DevFn does not invoke a shell.

HTTP readiness that names a leased `port` probes its direct loopback URL at startup, status and retry, even when a `url` is also configured. The configured URL's path and query are retained; an HTTPS proxy route uses its direct HTTP upstream, while a genuinely direct HTTPS endpoint keeps HTTPS. A separate `path` is checked for credentials and validated against the configured URL origin before a leased origin is substituted, then appended by the existing URL path rule. URL-only readiness remains an explicit URL check, except that a URL aimed at a selected proxy route is rejected before startup: that route is installed only after nodes are ready. Compose interpolation receives the same resolved generated, profile and service values before `docker compose up`; Compose files must explicitly map those values into container `environment` entries when the container needs them. Each Compose service receives container-context sibling URLs only for services in the same owner-specific project with a shared effective Compose network. The default network counts when Compose assigns it; disjoint explicit networks and network namespace modes do not provide sibling DNS. Independent projects are allowed; an unreachable reference is rejected before mutation. An unmanaged pre-existing container is reused only when its effective environment matches the current Compose configuration, allowing only unchanged image defaults beyond the current keys; removed generated, profile, and service literals are rejected before startup. A native dependent can use a Compose service's leased host URL after that service becomes ready. URL userinfo and sensitive query, fragment or path assignment keys in manifest environment, argv, or effective health URLs are rejected without printing credentials, including URL forms normalized by Node's URL parser and percent-encoded values; credential argv flags such as `--token` are also rejected. Aliases `key`, `pass`, `pwd`, `auth`, `sig`, `token`, `secret`, `password`, and `credential` are sensitive at separator or camel/acronym boundaries, including qualified forms such as `db_password`, `DB_PASS`, and `DBSig`. Compact forms use the documented qualifiers in the core package README; ordinary words such as `monkey` and `compass` remain data. Pass credentials through `envAllowlist` and `secretEnv`. A ready receipt fingerprints declared startup inputs, selected port declarations, and the effective Compose service and referenced volume, network and config definitions. Compose resolves default and include-scoped interpolation and env files before fingerprinting; inherited host variables in selected Compose source require an explicit envAllowlist entry, and credential-named and secretEnv values are redacted before hashing. An effective source or env-file change degrades status and causes a safe owned restart on retry; changes discarded by Compose merge rules and byte-equivalent restoration retain the same fingerprint. Missing optional Compose env files are allowed; required files must exist. Existing v0.1 receipts without startup or port-spec fingerprints keep their prior readiness path.

For native commands, package scripts and command-health argv, a colon-delimited credential pair following `--user`, `--username`, `--proxy-user`, `-u` or `-U` is rejected in split, equals and attached forms. Plain user names remain valid. Percent-encoded credential URLs and headers are also rejected; encoding does not turn them into safe non-secret literals. This inspection does not invoke a shell or alter argument bytes.

Form arguments with credential-named fields and JSON bodies with credential-named keys are rejected in those same three argv sources, including nested objects, JSON-escaped keys, percent-encoded bodies, incomplete JSON bodies and shell-quoted JSON in package scripts. Ordinary non-secret JSON remains argv data. Deliver credentials through `envAllowlist` and `secretEnv` instead of embedding them in a command or readiness check.

Before reusing an unmanaged Compose container with `--no-recreate`, DevFn also compares Compose's effective service config hash with the hash persisted on that container. A changed command, published port, image, or other startup setting is rejected even when the environment is unchanged. Missing or malformed hash evidence fails closed before `up`.

## Profiles and hostnames

Profiles select named processes/services, add non-secret environment, and opt into the shared proxy with `proxy: true`. Dependencies are included transitively and started topologically. Cycles fail before mutation.

A hostname maps a route name to `target`, optional `hostname` template, `tls` (`off` or `internal`), and optional `profiles` filter. Templates accept `{project}` and `{instance}`. The route uses a stable DNS-safe component derived from an opaque owner; owners differing only by case receive distinct route names; the original owner value remains in ownership records and `DEVFN_INSTANCE_ID`. A configured static hostname receives an owner-derived label before `.localhost`, so two owners cannot publish the same route. Every resolved name must end in `.localhost` unless the route explicitly refers to a machine-registered domain.

`devfn domains register dev.example.test --tls internal` records a user-owned development domain in the machine state directory, bound to the current repository identity and project. Registration requires every current DNS answer for the domain to be loopback; a new or changed selected route must also resolve exclusively to loopback before startup and Caddy reload. Existing routes stay installed when another instance stops, even if their DNS later becomes unavailable. DNS with no answers, mixed local/public answers, or a nonloopback answer fails closed for route activation. The command does not edit DNS, `/etc/hosts`, the OS resolver, or a trust store. `devfn domains list` and `devfn domains unregister <domain>` inspect or remove registrations; removal refuses domains with active or pending routes. Registrations cannot overlap across repositories. Public routing and remote targets have separate contracts.

A manifest can select `domain: "dev.example.test"` only after explicit machine registration. `host` optionally chooses a single DNS label shared by several path routes; otherwise the route key is used. The worktree hostname is `<host>-<readable-worktree-name>-<stable-suffix>.<domain>`. The primary Git worktree also gets `<host>.<domain>` as its canonical alias. Both forms use one label under the domain, so one wildcard certificate can cover them. The suffix prevents collisions between same-named worktrees without depending on activation order. A registered route inherits its TLS mode from the machine registration; the manifest cannot override it. Default `.localhost` routes and their v0.1 owner-derived names remain unchanged.

`path` defaults to `/`, with `match: "prefix"`; `match: "exact"` selects only that path. A prefix matches its segment boundary (`/api` and `/api/...`, not `/apix`). `stripPrefix: true` strips a non-root prefix before proxying. Exact routes precede prefixes; longer prefixes precede shorter ones. Duplicate host/path/match routes fail before Caddy reload, and a host with only selected paths returns 404 elsewhere. All upstreams remain loopback.

Internal TLS uses the existing Caddy internal CA. Clients must explicitly trust that CA if they need verified HTTPS; DevFn never installs it. `--tls certificate --cert /absolute/cert.pem --key /absolute/key.pem` uses explicit PEM files. DevFn validates the key pair, validity dates, and coverage of every generated hostname before publishing a route. A wildcard certificate may be needed for worktree names; a certificate for the registered base alone is insufficient. DNS-01 is rejected until a validated provider adapter is available. There is no implicit ACME, public certificate issuance, or CA installation.

## Organization policy

`devfn.policy.json` supports `fallbackRange`, `hostnameSuffix`, and entries with `name`, exactly one of `port`/`range`, `kind` (`protected`, `preferred`, or `excluded`), optional `project`, and `description`. `devfn ports report` combines the policy with the entire machine registry into Markdown; it is not limited to the current project or profile. `--output` must remain inside the repository.
