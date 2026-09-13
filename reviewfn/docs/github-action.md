# GitHub Action setup

The bundled composite is the credential-free review stage. Install the pinned CLI version, pull the pinned test image and build `reviewfn-codex:0.154.0` using the Dockerfile from the trusted harness package. Provision an inference-only Responses API proxy outside the untrusted review job. Set trusted base configuration to `action-proxy` with an explicit model, omit `harness.executable`, and provide an endpoint reachable from the Docker bridge.

Use `pull_request` opened/synchronize/reopened or a maintainer-authorized dispatch. Checkout the exact head with full history and `persist-credentials: false`. Pin the Action to a reviewed commit. The review job needs only `contents: read`; it must not contain `GITHUB_TOKEN` in its environment or credentials cached in the checkout. Input values are transported through environment variables to quoted argv, and versions/commit IDs are validated before invoking npx.

Upload the caller-owned output directory with `actions/upload-artifact@v4` and a unique PR/head/run name. Include report JSON, rendered Markdown and its artifacts directory. Publish in a separate trusted job with `pull-requests: write`, `issues: write`, and `checks: write`, without checking out PR code. Pin/install the published CLI there, download only the artifact from the corresponding review job, and run:

```sh
reviewfn publish --input "$REPORT" --repository "$REPOSITORY" \
  --pull-request "$PR_NUMBER" --head "$EXPECTED_HEAD" --profile requirements
```

Provide these identity values from trusted workflow event metadata, not the artifact. Export the publication token only in this job. Use a workflow concurrency group such as `reviewfn-${{ github.repository }}-${{ github.event.pull_request.number }}-requirements` with `cancel-in-progress: false`. This serializes publishers across machines; the API adapter also serializes concurrent callers in one process and takes an exclusive local filesystem lease across processes. A crashed lease is never stolen by timeout; verify its recorded process is dead before operator cleanup. A failed publish can rerun this command against the same artifact without inference.

Head changes detected before writes return stale. The comment includes the exact reviewed SHA; because GitHub lacks conditional comment writes tied to the current PR head, a change during a write can still leave a clearly labeled older-head comment. The next run replaces it. The single marker-scoped comment must belong to the configured publisher login (default `github-actions[bot]`). Oversized reports fail publication with a bounded error while the full local report is retained. Checks remain neutral regardless of verdict. Never configure them as a merge gate for version 0.1.

Public fork execution requires a deliberately provisioned isolated proxy runner. No unauthenticated failure becomes a passing review. Repository package publication itself remains a separate release operation; this PR does not publish npm packages or merge code.

For a PAT or GitHub App publisher, pass `--publisher-login` with the authenticated comment author login. The default is `github-actions[bot]`. The local lease is deliberately never stolen after a crash, including interruption before owner metadata is written; confirm no publisher is active before removing that lease.

The CLI preserves a named base ref as target-branch provenance. With SHA-only input it records `unknown` unless `--target-branch` or the Actions `GITHUB_BASE_REF` supplies the branch label; the reviewed commits remain separately pinned.
