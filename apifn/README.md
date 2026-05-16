# ApiFn

ApiFn is a code-first, self-hosted API development toolkit for OpenAPI generation, diffing, and collection testing.

## CI/CD

ApiFn provides a reusable GitHub Actions workflow at `apifn/.github/workflows/api-check.yml`.

### What it does

- Validates OpenAPI specs via `apifn validate --format json`
- Diffs current spec against base branch via `apifn diff --format json`
- Runs collection tests via `apifn test --reporter json`
- Emits machine-readable JSON artifacts (`validate-report.json`, `diff-report.json`, `test-report.json`)
- Builds a markdown summary and posts/updates a PR comment (optional)
- Enforces non-zero exits for validation failures, breaking changes, and test failures

### Inputs

- `spec_path` (required): Repo-relative OpenAPI path (e.g. `.apifn/openapi.yml`)
- `collection_dir` (required): Repo-relative OpenCollection directory (e.g. `.apifn/collection`)
- `environment` (optional, default `development`): Collection environment
- `base_branch` (optional, default `main`): Branch used to fetch baseline spec
- `fail_on_breaking` (optional, default `true`): Whether breaking diff exits non-zero
- `post_pr_comment` (optional, default `true`): Whether to post/update PR summary comment

### Example

See [`apifn/examples/ci-cd/github-actions.yml`](./examples/ci-cd/github-actions.yml).

### Non-GitHub CI

For GitLab/Jenkins/Buildkite, run the same CLI commands directly:

```bash
apifn validate .apifn/openapi.yml --format json
apifn diff .apifn/base-openapi.yml .apifn/openapi.yml --format json
apifn test .apifn/collection --env development --reporter json
```
