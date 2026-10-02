---
title: ReviewFn
description: Evidence-backed advisory pull request review.
---

ReviewFn reviews a frozen base/head change against issue and repository context. It runs approved tests in a disposable, isolated checkout, asks a compatible review harness for structured assessments, validates citations and evidence, and produces an advisory report. A separate trusted job can publish one current-head summary and a neutral GitHub check.

The first release is advisory. It does not edit code, push, merge, or declare a passing review when context, execution, evidence, or head identity is incomplete. Start with the [CLI quick start](/docs/getting-started), follow the [review workflow](/docs/workflow), and configure the [security boundary](/docs/security) before reviewing untrusted PRs.

The detailed [configuration](/docs/reference/configuration), [report schema](/docs/reference/report-schema), [GitHub Action](/docs/reference/github-action), and [evaluation](/docs/reference/evaluation) pages mirror the source guides in this repository. They describe the current `origin/dev` contract; verify the installed package version before assuming an earlier release has the same behavior.
