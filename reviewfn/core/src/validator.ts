import { sha256 } from "./canonical.js";
import type { CodeAnchor, ArtifactStore, ContextManifest, SourceReference, Assessment, Evidence, ReportPublisher, ReviewPolicy, ReviewReport, SourceControlAdapter, Verdict } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  verdict?: Verdict;
  coverage: "complete" | "incomplete";
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) seen.has(value) ? repeated.add(value) : seen.add(value);
  return [...repeated];
}

export function deriveVerdict(report: Pick<ReviewReport, "execution" | "coverage" | "requirements" | "assessments" | "findings">, policy: ReviewPolicy): Verdict | undefined {
  if (report.execution !== "completed") return undefined;
  if (report.coverage !== "complete" || !report.requirements.length || report.requirements.some(requirement => !requirement.statement.trim())) return "needs_verification";
  const mandatory = new Set(report.requirements.filter((requirement) => requirement.classification === "mandatory").map((requirement) => requirement.id));
  if (report.assessments.some((assessment) => mandatory.has(assessment.requirementId) && ["missing", "partial"].includes(assessment.status))) return "changes_requested";
  if (report.assessments.some((assessment) => mandatory.has(assessment.requirementId) && assessment.status === "unverified")) return "needs_verification";
  if (report.findings.some((finding) => policy.blockingSeverities.includes(finding.severity) && ["new", "still_valid"].includes(finding.lifecycle))) return "changes_requested";
  if (report.findings.some(finding => ["needs_revalidation", "resolved", "superseded"].includes(finding.lifecycle))) return "needs_verification";
  return "ready";
}

export async function validateReport(report: ReviewReport, policy: ReviewPolicy, sourceControl?: SourceControlAdapter, root?: string, context?: ContextManifest, artifacts?: ArtifactStore): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (context && context.digest !== report.contextManifestDigest) errors.push("Frozen context digest does not match the report.");
  const sources = new Map(context?.sources.map(source => [source.id, source]) ?? []);
  const referenceValid = (ref: SourceReference): boolean => {
    const source = sources.get(ref.sourceId);
    if (!source || source.status !== "available" || !source.content || !policy.sourceAuthority.acceptedTypes.includes(source.type) || (source.type === "comment" && !policy.sourceAuthority.commentsMayClarify)) return false;
    // Explicit literal excerpts or one-based line ranges are verifiable; arbitrary labels are not.
    if (ref.excerpt) return source.content.includes(ref.excerpt) && ref.excerpt.trim().length > 0;
    const match = /^L(\d+)(?:-L?(\d+))?$/.exec(ref.anchor);
    return !!match && Number(match[1]) > 0 && Number(match[2] ?? match[1]) >= Number(match[1]) && Number(match[2] ?? match[1]) <= source.content.split(/\r?\n/).length;
  };
  if (report.execution === "completed") {
    for (const requirement of report.requirements) if (!requirement.statement.trim()) errors.push(`Requirement ${requirement.id} has a blank statement.`);
    if (!report.requirements.length) errors.push("No requirements were extracted; extraction coverage is unverified.");
    if (!report.inspectedPaths.length) errors.push("No code paths were inspected.");
    for (const changed of report.change.changedPaths) if (!report.inspectedPaths.includes(changed) && !report.uninspected.some(item => item.scope === changed && item.reason.trim().length > 0)) errors.push(`Changed path ${changed} has no inspected or explicitly uninspected scope.`);
    for (const category of new Set([...policy.requiredCategories, ...(report.configuration.reviewCategories ?? [])])) if (!report.requirements.some(requirement => requirement.category === category)) errors.push(`Extraction coverage for required category ${category} is unverified.`);
    for (const source of context?.sources ?? []) {
      if (source.status !== "available" || !policy.sourceAuthority.acceptedTypes.includes(source.type) || (source.type === "comment" && !policy.sourceAuthority.commentsMayClarify)) continue;
      if (typeof source.content !== "string") {
        errors.push(`Available source ${source.id} has no content.`);
        continue;
      }
      if (!source.content) continue;
      const extracted = report.requirements.some(requirement => requirement.sources.some(ref => ref.sourceId === source.id));
      const excluded = report.evidence.some(evidence => evidence.kind === "source" && evidence.source?.sourceId === source.id && typeof evidence.sourceExclusionReason === "string" && evidence.sourceExclusionReason.trim().length > 0 && referenceValid(evidence.source));
      if (!extracted && !excluded) errors.push(`Extraction coverage for source ${source.id} is unverified; cite its requirements or source-backed exclusion evidence.`);
    }
    if (!context) errors.push("Frozen context is required to validate source authority.");
    for (const item of report.uninspected) if (!item.scope.trim() || !item.reason.trim()) errors.push("Uninspected scope requires a nonblank scope and reason.");
    if (report.uninspected.length && report.coverage === "complete") errors.push("Uninspected scope cannot claim complete coverage.");
  }
  const requirementIds = report.requirements.map((item) => item.id);
  const evidenceIds = report.evidence.map((item) => item.id);
  for (const id of duplicates(requirementIds)) errors.push(`Duplicate requirement id ${id}.`);
  for (const id of duplicates(evidenceIds)) errors.push(`Duplicate evidence id ${id}.`);
  for (const id of duplicates(report.findings.map(finding => finding.fingerprint))) errors.push(`Duplicate finding fingerprint ${id}; supply distinct stable symbols or finding semantics before correlation.`);

  const assessments = new Map<string, Assessment[]>();
  for (const assessment of report.assessments) assessments.set(assessment.requirementId, [...(assessments.get(assessment.requirementId) ?? []), assessment]);
  for (const requirement of report.requirements) {
    const matches = assessments.get(requirement.id) ?? [];
    if (matches.length !== 1) errors.push(`Requirement ${requirement.id} has ${matches.length} assessments; expected exactly one.`);
    for (const ref of requirement.sources) if (!referenceValid(ref)) errors.push(`Requirement ${requirement.id} has an unverifiable or unauthorized source reference.`);
    for (const dependency of requirement.dependencies) if (!report.requirements.some(item => item.id === dependency)) errors.push(`Requirement ${requirement.id} references unknown dependency ${dependency}.`);
    if (requirement.sources.length === 0) errors.push(`Requirement ${requirement.id} has no authoritative source.`);
  }
  for (const requirementId of assessments.keys()) if (!requirementIds.includes(requirementId)) errors.push(`Assessment references unknown requirement ${requirementId}.`);

  const evidence = new Map<string, Evidence>(report.evidence.map((item) => [item.id, item]));
  for (const assessment of report.assessments) {
    if (["implemented", "missing", "partial"].includes(assessment.status) && !assessment.evidenceIds.some(id => ["code", "diff", "test"].includes(evidence.get(id)?.kind ?? ""))) errors.push(`Assessment ${assessment.requirementId} claims ${assessment.status} without code or test evidence.`);
    if (assessment.confidence < 0 || assessment.confidence > 1) errors.push(`Assessment ${assessment.requirementId} has invalid confidence.`);
    if (assessment.status !== "not_applicable" && assessment.evidenceIds.length === 0) errors.push(`Assessment ${assessment.requirementId} has no evidence.`);
    if (assessment.status === "not_applicable" && (!assessment.waiverReference || !referenceValid(assessment.waiverReference) || !policy.sourceAuthority.waiverAuthorities.includes(assessment.waiverReference.sourceId))) errors.push(`Assessment ${assessment.requirementId} is not_applicable without a waiver.`);
    for (const id of assessment.evidenceIds) if (!evidence.has(id)) errors.push(`Assessment ${assessment.requirementId} references unknown evidence ${id}.`);
  }
  for (const finding of report.findings) {
    if (finding.lifecycle !== "new") errors.push(`Finding ${finding.fingerprint} claims a historical lifecycle without supplied prior finding provenance.`);
    if (!finding.evidenceIds.length) errors.push(`Finding ${finding.fingerprint} has no evidence.`);
    if (!finding.evidenceIds.some(id => ["code", "diff", "test"].includes(evidence.get(id)?.kind ?? ""))) errors.push(`Finding ${finding.fingerprint} has no implementation evidence.`);
    if (finding.basis === "reproduced") {
      let reproduced = false;
      for (const id of finding.evidenceIds) {
        const item = evidence.get(id);
        const receipt = item?.kind === "test" ? report.tests.find(test => test.id === item.receiptId && test.commit === report.change.headCommit && test.exitCode !== null && !test.timedOut && !test.canceled) : undefined;
        if (!receipt || !artifacts) continue;
        const stdout = receipt.stdoutArtifact ? await artifacts.get(receipt.stdoutArtifact) : undefined;
        const stderr = receipt.stderrArtifact ? await artifacts.get(receipt.stderrArtifact) : undefined;
        if (stdout && stderr && sha256(stdout) === receipt.stdoutDigest && sha256(stderr) === receipt.stderrDigest) reproduced = true;
      }
      if (!reproduced) errors.push(`Finding ${finding.fingerprint} claims reproduction without a completed test receipt and verified retained logs.`);
    }
    if (![finding.title, finding.trigger, finding.impact, finding.direction].every(value => value.trim().length > 0)) errors.push(`Finding ${finding.fingerprint} is missing actionable detail.`);
    for (const id of finding.evidenceIds) if (!evidence.has(id)) errors.push(`Finding ${finding.fingerprint} references unknown evidence ${id}.`);
    for (const id of finding.requirementIds) if (!requirementIds.includes(id)) errors.push(`Finding ${finding.fingerprint} references unknown requirement ${id}.`);
  }

  for (const item of report.evidence) {
    if (item.sourceExclusionReason !== undefined && (item.kind !== "source" || typeof item.sourceExclusionReason !== "string" || !item.sourceExclusionReason.trim())) errors.push(`Evidence ${item.id} has an invalid source exclusion reason.`);
    if (item.kind === "source" && (!item.source || !referenceValid(item.source))) errors.push(`Evidence ${item.id} has no verifiable source.`);
    if (["code", "diff"].includes(item.kind) && !item.code) errors.push(`Evidence ${item.id} has no code anchor.`);
    if (item.kind === "diff" && item.code && !report.change.changedPaths.includes(item.code.path)) errors.push(`Diff evidence ${item.id} is outside changed paths.`);
    if (item.kind === "test" && !report.tests.some(test => test.id === item.receiptId && test.commit === report.change.headCommit)) errors.push(`Evidence ${item.id} references no reviewed test receipt.`);
    if (item.kind === "artifact") {
      const ids = [report.contextManifestArtifact, report.normalizedEventArtifact, report.redactedTranscriptArtifact].filter((id): id is string => !!id);
      const id = ids.find(id => item.artifactDigest && id.endsWith(`-${item.artifactDigest}`));
      const bytes = id && artifacts ? await artifacts.get(id) : undefined;
      if (!bytes || sha256(bytes) !== item.artifactDigest) errors.push(`Evidence ${item.id} references no retained artifact with matching digest.`);
    }
    if (item.code && (!sourceControl || !root)) errors.push(`Evidence ${item.id} code anchor cannot be verified.`);
  }
  for (const assessment of report.assessments) if (assessment.status === "implemented") {
    const hasHeadImplementation = assessment.evidenceIds.some(id => {
      const item = evidence.get(id);
      if ((item?.kind === "code" || item?.kind === "diff") && item.code?.commit === report.change.headCommit) return true;
      return item?.kind === "test" && report.tests.some(test => test.id === item.receiptId && test.commit === report.change.headCommit && test.exitCode === 0 && !test.canceled && !test.timedOut);
    });
    if (!hasHeadImplementation) errors.push(`Assessment ${assessment.requirementId} claims implemented without reviewed-head implementation evidence.`);
    for (const id of assessment.evidenceIds) {
      const item = evidence.get(id);
      const receipt = item?.kind === "test" ? report.tests.find(test => test.id === item.receiptId) : undefined;
      if (receipt && (receipt.exitCode !== 0 || receipt.canceled || receipt.timedOut)) errors.push(`Assessment ${assessment.requirementId} relies on a failed or incomplete test.`);
    }
  }
  if (sourceControl && root) {
    const allowedCommit = async (anchor: CodeAnchor): Promise<boolean> => anchor.commit === report.change.headCommit || (anchor.commit === report.change.mergeBaseCommit && report.change.changedPaths.includes(anchor.path) && !!sourceControl.pathExists && !(await sourceControl.pathExists(root, report.change.headCommit, anchor.path)));
    for (const inspected of report.inspectedPaths) {
      const inHead = await sourceControl.verifyAnchor(root, { commit: report.change.headCommit, path: inspected, startLine: 1 });
      const deletedFromBase = !inHead && report.change.changedPaths.includes(inspected) && await sourceControl.verifyAnchor(root, { commit: report.change.mergeBaseCommit, path: inspected, startLine: 1 });
      if (!inHead && !deletedFromBase) errors.push(`Inspected path ${inspected} does not exist in the reviewed change.`);
    }
    for (const item of report.evidence) {
      if (item.code && !(await allowedCommit(item.code))) errors.push(`Evidence ${item.id} does not reference reviewed head ${report.change.headCommit}.`);
      if (item.code && !(await sourceControl.verifyAnchor(root, item.code))) errors.push(`Evidence ${item.id} has an invalid code anchor.`);
    }
    for (const finding of report.findings) {
      if (finding.anchor && !(await allowedCommit(finding.anchor))) errors.push(`Finding ${finding.fingerprint} does not reference reviewed head.`);
      if (finding.anchor && !(await sourceControl.verifyAnchor(root, finding.anchor))) errors.push(`Finding ${finding.fingerprint} has an invalid code anchor.`);
    }
  }

  if (report.execution !== "completed" && report.verdict !== undefined) errors.push("A non-completed run cannot have a verdict.");
  if (report.coverage === "incomplete" && report.verdict === "ready") errors.push("Incomplete coverage cannot have a ready verdict.");
  if (report.coverage === "incomplete" && report.coverageReasons.length === 0) errors.push("Incomplete coverage requires at least one reason.");
  if (report.findings.length > policy.limits.maxFindings) errors.push(`Report exceeds maxFindings (${policy.limits.maxFindings}).`);
  const derived = deriveVerdict(report, policy);
  if (report.verdict !== derived) errors.push(`Verdict ${String(report.verdict)} does not match derived verdict ${String(derived)}.`);
  if (policy.mode === "advisory" && report.verdict === "ready") warnings.push("Ready is advisory and must not be presented as an authorized merge gate.");
  return { valid: errors.length === 0, errors, warnings, verdict: derived, coverage: errors.length === 0 ? report.coverage : "incomplete" };
}

export async function preflightPublishers(publishers: readonly ReportPublisher[]): Promise<string[]> {
  const errors: string[] = [];
  for (const publisher of publishers) {
    const result = await publisher.preflight();
    if (!result.ok && !result.diagnostics.some(item => item.level === "error")) errors.push(`${publisher.id}: preflight refused publication.`);
    for (const diagnostic of result.diagnostics) if (diagnostic.level === "error") errors.push(`${publisher.id}: ${diagnostic.message}`);
  }
  return errors;
}
