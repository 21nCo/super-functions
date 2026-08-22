import type { AdminCapabilityManifest, AdminOperationDefinition } from "./types.js";

export type AdminMutationRiskCategory = "credential-lifecycle" | "external-side-effect";

export interface AdminMutationRiskReview {
  moduleId: string;
  operationId: string;
  categories: readonly AdminMutationRiskCategory[];
  classification: AdminOperationDefinition["safety"]["classification"];
  confirmationMethod?: NonNullable<AdminOperationDefinition["safety"]["confirmation"]>["method"];
  status: "pass" | "fail";
  reason: string;
}

const CREDENTIAL_RESOURCE = /(?:^|\.)(?:credentials?|secrets?|secret-sets?|secret-set-members?|device-tokens?|auth-sessions?|sessions?|connections?|provider-installations?|variables?|grants?|share-links?)(?:\.|$)/;
const EXTERNAL_ACTION = /(?:^|\.)(?:send-[a-z0-9-]+|publish|unpublish|deploy|rollback|attach|detach|connect|disconnect|authorize|refresh|refund-payment|change-subscription|cancel-subscription|reconcile-provider|manage-domain|create-webhook|expire-inbox|purge|enable|disable|run|enqueue|retry-run|cancel-run)$/;

/**
 * Produces deterministic JSON-safe evidence for every mutation whose operation
 * identity declares credential lifecycle or an externally visible side effect.
 * Credential lifecycle requires recent-auth, MFA, or approval. External side
 * effects require explicit confirmation metadata at minimum.
 */
export function reviewAdminMutationRisks(
  manifests: readonly AdminCapabilityManifest[],
): AdminMutationRiskReview[] {
  const reviews: AdminMutationRiskReview[] = [];
  for (const manifest of [...manifests].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const operation of [...manifest.operations].sort((left, right) => left.id.localeCompare(right.id))) {
      if (operation.safety.classification === "read") continue;
      const categories: AdminMutationRiskCategory[] = [];
      // Read operations were removed above, so every write under a
      // credential-bearing resource is reviewed even when its action name is
      // domain-specific (for example rotate-credential or create-share).
      if (CREDENTIAL_RESOURCE.test(operation.id)) categories.push("credential-lifecycle");
      if (EXTERNAL_ACTION.test(operation.id)) categories.push("external-side-effect");
      if (categories.length === 0) continue;
      const confirmation = operation.safety.confirmation;
      const credentialStrong = !categories.includes("credential-lifecycle") || Boolean(confirmation && ["recent-auth", "mfa", "approval"].includes(confirmation.method));
      const externalConfirmed = !categories.includes("external-side-effect") || Boolean(confirmation);
      const status = operation.safety.requiresConfirmation && credentialStrong && externalConfirmed ? "pass" : "fail";
      reviews.push({
        moduleId: manifest.id,
        operationId: operation.id,
        categories,
        classification: operation.safety.classification,
        ...(confirmation ? { confirmationMethod: confirmation.method } : {}),
        status,
        reason: status === "pass"
          ? "Declared confirmation meets the identified mutation risk."
          : categories.includes("credential-lifecycle") && !credentialStrong
            ? "Credential lifecycle requires recent-auth, MFA, or approval confirmation metadata."
            : "External side effects require explicit confirmation metadata.",
      });
    }
  }
  return reviews;
}
