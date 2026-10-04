<div align="center">
  <h1>Super functions</h1>
  <p>Self deployed super stack for building modern software.</p>
</div>
<div align="center">
  
[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange.svg)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](/LICENSE)
[![Discord](https://img.shields.io/discord/831815510563749889?logo=discord&logoColor=white)](https://discord.com/invite/9HJqKYTZKg)
 
</div>

> [!WARNING]
> **Alpha software**.
> Super functions is currently in alpha and is not yet fully ready for production use. APIs and behavior may change without notice, and some features may be incomplete or unstable. Evaluate it carefully and use it at your own risk.

# Functions

## Data and storage

| Function | Description |
| --- | --- |
| dataFn | Full stack data management framework with offline-first sync, reactive signals, sharing capability, and auto REST API.<br><br>**Packages:** [npm](https://www.npmjs.com/package/@datafn/client) · [PyPI](https://pypi.org/project/datafn/) |
| fileFn | Complete file management with resumability, multi-part uploads, security, processing, versioning, storage quota and analytics.<br><br>**Packages:** [npm](https://www.npmjs.com/package/@filefn/client) · [PyPI](https://pypi.org/project/filefn/) |
| searchFn | Adapter-first full-text search for browser, native mobile apps and server with offline IndexedDB and DataFn integration.<br><br>**Packages:** [npm](https://www.npmjs.com/package/@searchfn/client) |

## Application core

| Function | Description |
| --- | --- |
| authFn | Drop-in authentication and user management. Social logins, magic links, session handling, AI agent authentication and more.<br><br>**Packages:** [npm](https://www.npmjs.com/package/@authfn/client) · [PyPI](https://pypi.org/project/authfn/) |
| billFn | Complete billing infrastructure. Subscriptions, one-time payments, usage-based billing, analytics, store integrations and invoicing.<br><br>**Packages:** [npm](https://www.npmjs.com/package/billfn) |
| [mcpFn](./mcpfn/README.md) | Build and regression-test MCP servers with protocol contracts, OAuth/API-key testkits, Playwright auth fixtures, host profiles, official conformance, and safe DataFn exposure.<br><br>**Packages:** `@mcpfn/core` · `@mcpfn/auth` · `@mcpfn/testing` · `@mcpfn/datafn` · `@mcpfn/cli` |
| [reviewFn](./reviewfn/README.md) | Portable, evidence-backed pull-request review with requirement traceability, explicit incomplete states, isolated verification and configurable harnesses.<br><br>**Packages:** `@superfunctions/reviewfn-core` · `@superfunctions/reviewfn-cli` · `@superfunctions/reviewfn-harness-codex` · `@superfunctions/reviewfn-context-composio` · `@superfunctions/reviewfn-github` · `@superfunctions/reviewfn-testing` |
| plugFn | Universal API integration SDK. Connect to third-party services with a standardized interface and automatic auth handling.<br><br>**Packages:** [npm](https://www.npmjs.com/package/plugfn) |

## User Interface

| Function | Description |
| --- | --- |
| [uiFn](./uifn) | Reusable frontend component primitives, themes, framework adapters, catalogs, registry delivery, and design-system tooling.<br><br>**Packages:** `@uifn/*` |

## Infrastructure and meta

| Function | Description |
| --- | --- |
| hostFn | Handy CLI and dashboard for all hosting needs.<br><br>**Packages:** [npm](https://www.npmjs.com/package/hostfn) |
| extFn | Complete extension development platform. Frontend framework agnostic, with hot-reload, automatic bundling, scanning and publishing.<br><br>**Packages:** [npm](https://www.npmjs.com/org/extfn) |
| [apiFn](./apifn) | AI native API client and testing, including the `@apifn/docsfn` OpenAPI reference plugin.<br><br>**Packages:** [npm](https://www.npmjs.com/org/apifn) |


## Releases

Release tags must point to the reviewed commit containing the exact package
version and all prerequisite fixes. Manual dispatch requires an **existing tag**:
the workflows check out `refs/tags/<release_tag>`, not the dispatching branch,
and reject a deleted or moved tag before publication. Do not retag releases.
The commands below validate/build locally; they do not publish.

### npm libraries

`release-packages.json` is the public-library allowlist for
`.github/workflows/publish-tag.yml`. It includes the 31 previously unmapped
libraries; the root workspace, examples and private packages remain excluded.
Tags use `<package-slug>-v<exact-package.json-version>`.

```sh
node --test scripts/resolve-release-tag.test.mjs scripts/assert-release-ref.test.mjs scripts/swift-release.test.mjs
node scripts/resolve-release-tag.mjs uifn-patterns-v0.2.0-experimental.0
# In the resolved package directory, install its declared dependencies first:
npm install --workspaces=false --package-lock=false
# From the repository root, build/test/pack the selected current manifest tag:
node scripts/pack-release-package.mjs <package-slug>-v<version>
```

The pack command checks committed generated inputs, then runs declared build,
typecheck (or `type-check`) and test scripts followed by `npm pack` lifecycle
hooks. Regenerate/sign catalogs before tagging; packing never regenerates them.
The workflow publishes the **exact tarball**, with lifecycle scripts disabled.
Packing embeds the checked-out commit as `gitHead` and restores the source
manifest byte-for-byte, including on pack failure, so tarball publication keeps
verifiable registry lineage.
React component gates resolve React/ReactDOM from the installed test renderer's
peer tree, keeping workspace and package-local runs coherent without first-party
source aliases or dependency-version changes.
Stable releases use `latest`; prereleases use their first identifier, such as
`experimental` or `rc`. Numeric/range-like, noncanonical and `latest` prerelease
channels fail rather than overwriting stable installations. `@uifn/patterns`
and `@uifn/sf` remain experimental. Publication retains the existing
`NPM_TOKEN`/`NODE_AUTH_TOKEN` mechanism; the token must have publish permission
for the selected package. A missing/invalid token or occupied version fails.
Publish the required internal npm dependency closure before its consumers.

### Python libraries

`.github/workflows/publish-python.yml` releases these 12 projects independently:
`apifn`, `authfn`, `billfn`, `datafn`, `filefn`, `plugfn`, `searchfn`, `sendfn`,
`superfunctions-core`, `superfunctions-fastapi`, `superfunctions-flask` and
`superfunctions-sqlalchemy`. Tags use `python-<project>-v<exact-pyproject-version>`
and cannot trigger npm publication. Versions must be canonical PEP 440 stable
or `a`/`b`/`rc` prereleases; local, dev, post and epoch versions are not supported.
PyPI/pip prerelease selection is preserved: publishing a prerelease does not
promote it to a stable release. The registry gate rejects occupied versions and
versions at or below the newest stable release.

Use a fresh Python 3.12 virtual environment **per package**:

```sh
python3.12 -m venv /tmp/superfunctions-python-release
/tmp/superfunctions-python-release/bin/python -m pip install build twine packaging
/tmp/superfunctions-python-release/bin/python -m unittest discover -s scripts -p test_python_release.py
/tmp/superfunctions-python-release/bin/python scripts/python_release.py resolve python-apifn-v0.0.1
# Read-only network gate; fails if this version is occupied or regressive:
/tmp/superfunctions-python-release/bin/python scripts/python_release.py check-registry python-apifn-v0.0.1
# Build/test current sources without uploading, even for occupied versions:
/tmp/superfunctions-python-release/bin/python scripts/python_release.py build python-apifn-v0.0.1 --out-dir /tmp/apifn-release-artifacts
```

The build command requires a nonexistent output directory, builds an sdist and
then a wheel **from that sdist**, verifies both distribution identities, runs
`twine check --strict`, installs the wheel with declared test/optional extras,
runs package-local pytest and imports its shipped modules outside the checkout.
It does not upload. Before a later release, select unoccupied versions above
the stable registry baseline; existing consumer versions are intentionally
unchanged except for the SQLAlchemy patch required by the core-name cutover.
In the origin/dev inventory, `searchfn`, `plugfn`, `sendfn`,
`filefn` have occupied manifest versions;
`authfn` is below its stable baseline. These gates intentionally remain closed
until version policy is applied for an authorized Python publication.

PyPI's `superfunctions@0.1.3` is the unrelated Youssef/youssefa metafunction
project, not a 21n release or baseline. The unclaimed distribution
`superfunctions-core` replaces that name; its initial unpublished version stays
`0.1.1` and its import namespace stays `superfunctions`. Only
`python-superfunctions-core-v0.1.1` is supported, not the old core tag.
The SQLAlchemy adapter moves to the unused 0.1.1 packaging patch; SendFn extras
require migrated adapter versions at least 0.1.1 so they cannot pull an older
adapter's dependency on the unrelated distribution.
No Python publication is authorized here. For a later authorized release,
publish the real core prerequisite first, then adapters needed by SDK extras,
then dependent SDKs. Production release validation requires those prerequisites
on PyPI and never substitutes checkout sources.

Development CI's `scripts/ci-run-python-package.mjs` installs local runtime and
`[dev]` dependency closures before the target, including AuthFn's FastAPI/Flask
adapters. Other optional groups are not selected by that CI gate; packed-wheel
qualification below selects all extras.

For pre-publication validation, first build the actual core wheel using
`python scripts/python_release.py build python-superfunctions-core-v0.1.1
--out-dir /tmp/python-core-artifacts` in its own fresh environment. In each
consumer's fresh environment, set `PIP_FIND_LINKS=/tmp/python-core-artifacts`
when invoking the same build command for that consumer's exact manifest tag.
Pip inherits this standard environment setting; no source fallback or mock
publication is used. If an optional extra needs a newly packed adapter, add its
artifact directory to the space-separated `PIP_FIND_LINKS` value after validating
that adapter against the core wheel. Only tests/configuration and BillFn's
`examples/mock_api.py` fixture are copied into the isolated test directory;
SDK sources and sibling core sources are never copied.

**External prerequisite: PyPI trusted publishing must be configured, not
assumed.** For each of the 12 project names above, add a GitHub trusted publisher
(or a pending publisher for a new project) in PyPI with owner `21nCo`,
repository `super-functions`, workflow filename `publish-python.yml` and
environment name `pypi`. Create/protect the GitHub `pypi` environment with
appropriate reviewers and release-tag restrictions. The publish job alone
receives `id-token: write`; it uses PyPI OIDC and attestations, not a fallback
token or `skip-existing`. Missing enrollment/permissions fail publication.
The previously configured `dev`/`live` environments do not establish PyPI
enrollment. No Python publication is part of the current workflow repair.

### Swift root source distribution

`.github/workflows/release-swift.yml` owns root `v<strict-semver>` tags. SwiftPM
gets its version from that immutable git tag, not from an npm or Python
manifest; these root tags cannot trigger either package-publication workflow.
It validates the root `Package.swift`'s 12 library products on macOS, resolves
dependencies, release-builds every product, and runs the root test suite:
Use Swift 6/Xcode 16 or newer for validation. Tests use the toolchain's bundled
Swift Testing runtime/macros together, not a separately pinned development runtime
or an overriding Command Line Tools framework search path.

```sh
node scripts/swift-release.mjs resolve v0.1.0
node scripts/swift-release.mjs validate v0.1.0
# Requires the actual immutable tag, and only creates a local source archive:
node scripts/assert-release-ref.mjs v0.1.0
node scripts/swift-release.mjs archive v0.1.0
```

Stable root tags must be newer than earlier stable root tags. The source release
uses `GITHUB_TOKEN` with `contents: write`, attaches a `git archive` of the tag,
and refuses to replace an existing GitHub release. Prerelease GitHub releases
use `--prerelease --latest=false`; they never replace stable latest semantics.
GitHub repository/environment policy must permit source-release creation.
There was no root semantic version tag in the inventory; choosing/pushing one
and creating a Swift release are separate authorization steps, not part of the
current workflow repair.

## Contributing

Due to the current size of our team, we are not accepting external contributions at this time. We appreciate your interest and understanding.

### License

This project is licensed under the MIT license. See the [LICENSE](LICENSE) file for details.

### Contact

For any questions, security reporting or feedback, please contact us at [hello@21n.co](mailto:hello@21n.co).

❤️ We extend our deepest gratitude to all the [OSS libraries and tools](https://github.com/21nCo/super-functions/network/dependencies) that made this project possible.
