import type { Adapter } from "@superfunctions/db";
import { resetAndSeedBaseline } from "./seed.js";

const BASELINE_SCENARIO = "baseline";

export type DemoResetSuccessEnvelope = {
  ok: true;
  result: {
    scenario: "baseline";
    documentCounts: {
      "org:acme": number;
      "org:globex": number;
    };
    membershipCounts: {
      "org:acme": number;
      "org:globex": number;
    };
  };
};

export type DemoResetErrorEnvelope = {
  ok: false;
  error: {
    code: "DEMO_RESET_FAILED";
    message: string;
    details?: {
      path: string;
    };
  };
};

export type DemoResetEnvelope = DemoResetSuccessEnvelope | DemoResetErrorEnvelope;

function parseScenarioFromBody(body: unknown): string {
  if (body === null || body === undefined) {
    return BASELINE_SCENARIO;
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    return "";
  }

  if (!Object.prototype.hasOwnProperty.call(body, "scenario")) {
    return BASELINE_SCENARIO;
  }

  const candidate = (body as Record<string, unknown>).scenario;
  if (typeof candidate !== "string") {
    return "";
  }

  return candidate.trim();
}

export async function executeDemoReset(
  db: Adapter,
  body: unknown,
): Promise<DemoResetEnvelope> {
  const scenario = parseScenarioFromBody(body);

  if (scenario !== BASELINE_SCENARIO) {
    return {
      ok: false,
      error: {
        code: "DEMO_RESET_FAILED",
        message: "Unsupported reset scenario",
        details: {
          path: "scenario",
        },
      },
    };
  }

  try {
    const counts = await resetAndSeedBaseline(db);
    return {
      ok: true,
      result: {
        scenario: "baseline",
        documentCounts: counts.documentCounts,
        membershipCounts: counts.membershipCounts,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "DEMO_RESET_FAILED",
        message: "Reset failed",
      },
    };
  }
}
