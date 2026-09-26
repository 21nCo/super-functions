---
title: Evaluation contract
description: Measure frozen cases and report comparison confounds.
---

# Evaluation

`reviewfn evaluate --input evaluation.json` consumes frozen cases and observed outcomes. Each case records source/change digests, agent-authored requirements, known gaps, valid findings, acceptability, retrospective status and limitations.

The result always includes numerators and denominators for requirement-extraction recall, gap-detection recall, finding precision, false-block rate, evidence validity and completion rate. Failed and missing outcomes remain in completion denominators. The false-block denominator includes only acceptable cases with an observed outcome; when none exist, the rate is null rather than zero. Runtime, tokens and measurable cost are reported only when observed; unavailable values remain null.

Comparisons name every changed harness, version, provider, model, prompt, context or budget dimension. A result with more than one changed dimension is confounded and must not be described as a model-only ranking.

Historical cases require exact contemporaneous heads and source snapshots. When source version history cannot be recovered, mark the case retrospective. Prior bot labels and assistant judgments are candidate labels, not adjudicated ground truth.

The repository includes `evaluation/data6-pr153.json` and its evidence ledger as a first retrospective schema smoke test. It must not be presented as model-quality evidence: it contains one agent-authored case, current rather than contemporaneous Linear source content, and no token, cost, or live-model timing observations.

`evaluation/data6-pr153-live.json` records a real Codex CLI 0.145.0 / gpt-5.6-sol run over bounded historical source excerpts, including eight extracted requirements, assessments, evidence, runtime and observed usage. It is separate from the older agent-labeled schema smoke. The source summary is retrospective, the downstream repository is absent, and no held-out or human-adjudicated model-quality estimate is claimed. `linear-live-receipt.json` records successful live retrieval of SFNS-3, four comments and three linked specifications by the actual Composio adapter. That receipt is a metadata-only observation, not a replayable content artifact: its digests cannot be independently recomputed from the committed receipt. The local historical CLI was 0.145.0; the separately tested container image pins 0.154.0.

The executable release gate runs the package suites, Docker containment cases, Action shell-input tests and an external installed CLI pipeline. `CONFORMANCE_FIXTURES` is a scenario catalog, not a count of executed tests. Use the gate's actual test output for coverage claims; platform-specific containment and external service availability remain explicit integration prerequisites.
