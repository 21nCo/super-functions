---
title: GitHub publication
description: Keep review execution separate from trusted advisory publishing.
---

# GitHub publication

`reviewfn/github/action.yml` is a composite action for the credential-free review stage. Pin the action and CLI version, check out the exact head with full history and no persisted credentials, and supply trusted base/head/PR identity. The review job uploads its report and artifacts. Public forks require an explicitly provisioned isolated proxy runner.

In a separate trusted job, download only the artifact from that review job and run:

```sh
reviewfn publish --input "$REPORT" --repository "$REPOSITORY" \
  --pull-request "$PR_NUMBER" --head "$EXPECTED_HEAD" --profile requirements
```

Derive those values from trusted workflow metadata, not the report artifact. The publisher needs GitHub write permissions for PR comments and checks and must not execute PR code. Use one repository/PR/profile concurrency group. Publication rechecks the current head before writes, maintains a single profile summary, and updates the same run's check idempotently. A head change during a GitHub write can leave a clearly labeled older-head comment; the next run replaces it.

Checks remain neutral regardless of verdict. Version 0.1 does not support a `gate` output mode. The [full GitHub Action guide](/docs/reference/github-action) gives permissions, pinning, retries, lease recovery, and publisher-login details.
