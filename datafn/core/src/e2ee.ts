export const DATAFN_E2EE_ENVELOPE_MARKER = "__datafnE2ee";

export type DatafnE2eeCipherEnvelope = {
  __datafnE2ee: 1;
  alg: "AES-GCM";
  keyRef: string;
  iv: string;
  data: string;
};

export function isDatafnE2eeEnvelope(value: unknown): value is DatafnE2eeCipherEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate[DATAFN_E2EE_ENVELOPE_MARKER] === 1 &&
    candidate.alg === "AES-GCM" &&
    typeof candidate.keyRef === "string" &&
    candidate.keyRef.length > 0 &&
    typeof candidate.iv === "string" &&
    candidate.iv.length > 0 &&
    typeof candidate.data === "string" &&
    candidate.data.length > 0
  );
}
