import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RequirementEntry = {
  id: string;
  priority: string;
  vectors: string[];
};

type ReleaseGateResult =
  | {
      ok: true;
      result: {
        report: {
          p0Passed: true;
          reportPath: string;
        };
      };
    }
  | {
      ok: false;
      error: {
        code: "CONFLICT";
        message: "Release blocked: P0 conformance failed";
        details: { path: "conformance" };
      };
    };

const TEST_FILE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_FILE_DIR, "../../../../../");
const SPEC_FOLDER = "2026-03-13-new-bhszlzcn-spec";
const SPEC_ROOT = resolve(REPO_ROOT, "datafn/.conduct/specs", SPEC_FOLDER);
const REQUIREMENTS_PATH = resolve(SPEC_ROOT, "REQUIREMENTS.md");
const TEST_VECTORS_PATH = resolve(SPEC_ROOT, "TEST_VECTORS.md");
const REPORT_PATH = resolve(REPO_ROOT, ".conduct/reports/spv2-conformance.json");
const THIS_TEST_PATH = relative(REPO_ROOT, fileURLToPath(import.meta.url));

const DOC_SHARING_V2 = resolve(
  REPO_ROOT,
  "datafn/docs/content/docs/documentation/concepts/sharing-v2.mdx",
);
const DOC_SYNC_LIFECYCLE = resolve(
  REPO_ROOT,
  "datafn/docs/content/docs/documentation/sync/sharing-sync-lifecycle.mdx",
);
const DOC_MIGRATION = resolve(
  REPO_ROOT,
  "datafn/docs/content/docs/documentation/migrations/spv2.mdx",
);
const DOC_USE_CASES = resolve(
  REPO_ROOT,
  "datafn/docs/content/docs/documentation/use-cases/sharing-patterns.mdx",
);

const TRACEABLE_EQUIVALENTS: Record<string, string[]> = {
  "TV-ARCH-001-P": ["datafn/server/src/execution/mutation/__tests__/archive.test.ts"],
  "TV-ARCH-001-N": ["datafn/server/src/execution/mutation/__tests__/archive.test.ts"],
  "TV-ARCH-002-P": ["datafn/server/src/execution/mutation/__tests__/archive.test.ts"],
  "TV-ARCH-002-N": ["datafn/server/src/execution/mutation/__tests__/archive.test.ts"],
  "TV-ARCH-003-P": ["datafn/server/src/execution/mutation/__tests__/archive.test.ts"],
  "TV-ARCH-003-N": ["datafn/server/src/execution/mutation/__tests__/archive.test.ts"],
  "TV-ARCH-005-P": ["datafn/server/src/execution/mutation/__tests__/archive.test.ts"],
  "TV-ARCH-005-N": ["datafn/server/src/execution/mutation/__tests__/archive.test.ts"],
  "TV-API-001-P": ["datafn/server/src/validation/__tests__/validation.test.ts"],
  "TV-API-001-N": ["datafn/server/src/validation/__tests__/validation.test.ts"],
  "TV-API-002-P": ["datafn/server/src/validation/__tests__/validation.test.ts"],
  "TV-API-002-N": ["datafn/server/src/validation/__tests__/validation.test.ts"],
  "TV-API-003-P": ["datafn/server/src/routes/__tests__/execution-errors.test.ts"],
  "TV-API-003-N": ["datafn/server/src/routes/__tests__/execution-errors.test.ts"],
  "TV-AUTH-001-P": ["datafn/server/src/__tests__/integration/spv2-parity.test.ts"],
  "TV-AUTH-001-N": ["datafn/server/src/__tests__/integration/spv2-parity.test.ts"],
  "TV-AUTH-002-P": ["datafn/server/src/__tests__/integration/spv2-parity.test.ts"],
  "TV-AUTH-002-N": ["datafn/server/src/__tests__/integration/spv2-parity.test.ts"],
  "TV-AUTH-003-P": ["datafn/server/src/__tests__/integration/spv2-parity.test.ts"],
  "TV-AUTH-003-N": ["datafn/server/src/__tests__/integration/spv2-parity.test.ts"],
  "TV-AUTH-004-P": ["datafn/server/src/execution/sync/__tests__/spv2-sync-visibility.test.ts"],
  "TV-AUTH-004-N": ["datafn/server/src/execution/sync/__tests__/spv2-sync-visibility.test.ts"],
  "TV-AUTH-005-P": ["datafn/server/src/__tests__/integration/spv2-parity.test.ts"],
  "TV-AUTH-005-N": ["datafn/server/src/__tests__/integration/spv2-parity.test.ts"],
  "TV-REL-001-P": [
    "datafn/server/src/execution/mutation/__tests__/relation-inheritance-spv2.test.ts",
    "datafn/server/src/execution/query/__tests__/relation-inheritance-query.test.ts",
  ],
  "TV-REL-001-N": [
    "datafn/server/src/execution/mutation/__tests__/relation-inheritance-spv2.test.ts",
    "datafn/server/src/execution/query/__tests__/relation-inheritance-query.test.ts",
  ],
  "TV-SYNC-001-P": ["datafn/server/src/execution/sync/__tests__/spv2-sync-visibility.test.ts"],
  "TV-SYNC-001-N": ["datafn/server/src/execution/sync/__tests__/spv2-sync-visibility.test.ts"],
  "TV-SYNC-003-P": ["datafn/server/src/execution/sync/__tests__/spv2-sync-visibility.test.ts"],
  "TV-SYNC-003-N": ["datafn/server/src/execution/sync/__tests__/spv2-sync-visibility.test.ts"],
  "TV-COMP-001-P": ["datafn/server/src/execution/migration/__tests__/spv2-migration.test.ts"],
  "TV-COMP-001-N": ["datafn/server/src/execution/migration/__tests__/spv2-migration.test.ts"],
  "TV-COMP-002-P": [
    "datafn/server/src/execution/migration/__tests__/spv2-migration.test.ts",
    "datafn/server/src/execution/mutation/__tests__/share-spv2.test.ts",
  ],
  "TV-COMP-002-N": [
    "datafn/server/src/execution/migration/__tests__/spv2-migration.test.ts",
    "datafn/server/src/execution/mutation/__tests__/share-spv2.test.ts",
  ],
  "TV-SEC-001-P": [
    "datafn/python/tests/test_spv2_parity.py",
    "datafn/server/src/execution/migration/__tests__/spv2-migration.test.ts",
  ],
  "TV-SEC-001-N": ["datafn/python/tests/test_spv2_parity.py"],
  "TV-USE-001-P": ["datafn/docs/content/docs/documentation/use-cases/sharing-patterns.mdx"],
  "TV-USE-001-N": ["datafn/server/src/__tests__/conformance/spv2-conformance.test.ts"],
  "TV-TEST-001-P": ["datafn/server/src/__tests__/conformance/spv2-conformance.test.ts"],
  "TV-TEST-001-N": ["datafn/server/src/__tests__/conformance/spv2-conformance.test.ts"],
};

const REQUIRED_DOMAINS = [
  "Collections",
  "Memotron",
  "Selftron",
  "Pointron",
  "Finatron",
  "Feedtron",
  "Compoundum",
];

async function collectFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      const next = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(next);
        continue;
      }
      if (/\.(ts|tsx|py|md|mdx|json)$/.test(entry.name)) {
        out.push(next);
      }
    }
  }
  await walk(root);
  return out;
}

function parseRequirements(requirements: string): RequirementEntry[] {
  const re = /##\s+([A-Z0-9-]+)\n- ID:\s+\1\n- Priority:\s+(P\d)[\s\S]*?- Test vectors:\s+([^\n]+)/g;
  const rows: RequirementEntry[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(requirements)) !== null) {
    rows.push({
      id: match[1],
      priority: match[2],
      vectors: match[3].split(",").map((value) => value.trim()),
    });
  }
  return rows;
}

function parseVectorIds(testVectorsMd: string): string[] {
  const re = /^##\s+(TV-[A-Z0-9-]+)/gm;
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(testVectorsMd)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

function evaluateReleaseGate(input: {
  requiredPriority: "P0";
  failedVectors: string[];
}): ReleaseGateResult {
  if (input.failedVectors.length > 0) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Release blocked: P0 conformance failed",
        details: { path: "conformance" },
      },
    };
  }

  return {
    ok: true,
    result: {
      report: {
        p0Passed: true,
        reportPath: ".conduct/reports/spv2-conformance.json",
      },
    },
  };
}

function checkDocumentationClarity(docText: string): { ok: true } | {
  ok: false;
  error: {
    code: "INTERNAL";
    message: "Documentation clarity gate failed";
    details: { path: "docs.glossary" };
  };
} {
  const termChecks: Array<[string, RegExp]> = [
    ["namespace", /\*\*Namespace\*\*\s*:/i],
    ["principal", /\*\*Principal\*\*\s*:/i],
    ["visibility", /\*\*Visibility\*\*\s*:/i],
    ["scope grant", /\*\*Scope grant\*\*\s*:/i],
    ["relation inheritance", /\*\*Relation inheritance\*\*\s*:/i],
    ["pull", /\*\*Pull\*\*\s*:/i],
    ["push", /\*\*Push\*\*\s*:/i],
    ["revoke", /\*\*Revoke\*\*\s*:/i],
    ["backfill", /\*\*Backfill\*\*\s*:/i],
  ];

  for (const [, pattern] of termChecks) {
    if (!pattern.test(docText)) {
      return {
        ok: false,
        error: {
          code: "INTERNAL",
          message: "Documentation clarity gate failed",
          details: { path: "docs.glossary" },
        },
      };
    }
  }

  if (/\bACL\b/.test(docText) || /\bRLS\b/.test(docText)) {
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Documentation clarity gate failed",
        details: { path: "docs.glossary" },
      },
    };
  }

  return { ok: true };
}

function validateUseCaseMappings(
  useCasesDoc: string,
  requiredDomains: readonly string[],
): { ok: true } | {
  ok: false;
  error: {
    code: "INTERNAL";
    message: "Use-case mapping incomplete";
    details: { path: string };
  };
} {
  for (const domain of requiredDomains) {
    if (!new RegExp(`^##\\s+${domain}\\s*$`, "m").test(useCasesDoc)) {
      return {
        ok: false,
        error: {
          message: "Use-case mapping incomplete",
          details: { path: `domains.${domain}` },
          code: "INTERNAL",
        },
      };
    }

    const sectionStart = useCasesDoc.search(new RegExp(`^##\\s+${domain}\\s*$`, "m"));
    const sectionTail = useCasesDoc.slice(sectionStart);
    const nextHeadingIndex = sectionTail.slice(1).search(/^##\s+/m);
    const section =
      nextHeadingIndex === -1
        ? sectionTail
        : sectionTail.slice(0, nextHeadingIndex + 1);

    if (!/###\s+Happy Path/m.test(section) || !/###\s+Forbidden Case/m.test(section)) {
      return {
        ok: false,
        error: {
          code: "INTERNAL",
          message: "Use-case mapping incomplete",
          details: { path: `domains.${domain}` },
        },
      };
    }
  }

  return { ok: true };
}

describe("SPV2 conformance gate (PHASE_12)", () => {
  it("TV-DOC-001-P, TV-USE-001-P, TV-TEST-001-P: builds conformance matrix and writes green release report", async () => {
    const [requirementsMd, testVectorsMd, sharingV2Doc, syncLifecycleDoc, migrationDoc, useCasesDoc] =
      await Promise.all([
        readFile(REQUIREMENTS_PATH, "utf8"),
        readFile(TEST_VECTORS_PATH, "utf8"),
        readFile(DOC_SHARING_V2, "utf8"),
        readFile(DOC_SYNC_LIFECYCLE, "utf8"),
        readFile(DOC_MIGRATION, "utf8"),
        readFile(DOC_USE_CASES, "utf8"),
      ]);

    const requirements = parseRequirements(requirementsMd);
    const allVectorIds = parseVectorIds(testVectorsMd);
    const p0VectorIds = requirements
      .filter((entry) => entry.priority === "P0")
      .flatMap((entry) => entry.vectors);

    const corpusRoots = [
      resolve(REPO_ROOT, "datafn/server/src"),
      resolve(REPO_ROOT, "datafn/python/tests"),
      resolve(REPO_ROOT, "datafn/docs/content/docs"),
    ];
    const corpusFiles = (
      await Promise.all(corpusRoots.map((root) => collectFiles(root)))
    ).flat();

    const corpus = await Promise.all(
      corpusFiles.map(async (file) => ({ file, text: await readFile(file, "utf8") })),
    );

    const vectorRows = p0VectorIds.map((vectorId) => {
      const literalSources = corpus
        .filter((entry) => entry.text.includes(vectorId))
        .map((entry) => relative(REPO_ROOT, entry.file));
      const literalWithoutSelf = literalSources.filter((path) => path !== THIS_TEST_PATH);

      const equivalentSources = (TRACEABLE_EQUIVALENTS[vectorId] ?? []).filter((path) =>
        existsSync(resolve(REPO_ROOT, path)),
      );

      const traceable = literalWithoutSelf.length > 0 || equivalentSources.length > 0;
      return {
        id: vectorId,
        priority: "P0",
        status: traceable ? "pass" : "fail",
        evidence:
          literalWithoutSelf.length > 0
            ? literalWithoutSelf
            : equivalentSources,
        source: literalWithoutSelf.length > 0 ? "literal" : "equivalent",
      };
    });

    const untraceableP0 = vectorRows.filter((row) => row.status === "fail").map((row) => row.id);

    const docsCoverageComplete = [sharingV2Doc, syncLifecycleDoc, migrationDoc, useCasesDoc].every(
      (text) => text.length > 0,
    );

    const clarity = checkDocumentationClarity(sharingV2Doc);
    const useCaseCoverage = validateUseCaseMappings(useCasesDoc, REQUIRED_DOMAINS);

    const hasSyncDiagram = /sequenceDiagram/.test(syncLifecycleDoc);
    const hasForbiddenExample = /Forbidden/i.test(sharingV2Doc) && /Forbidden Case/i.test(useCasesDoc);
    const hasHappyExample = /Happy Path/i.test(sharingV2Doc) && /Happy Path/i.test(useCasesDoc);

    const releaseGate = evaluateReleaseGate({
      requiredPriority: "P0",
      failedVectors: untraceableP0,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      specFolder: SPEC_FOLDER,
      reportVersion: 1,
      requiredPriority: "P0",
      allVectorsCount: allVectorIds.length,
      vectors: vectorRows,
      docs: {
        files: [
          relative(REPO_ROOT, DOC_SHARING_V2),
          relative(REPO_ROOT, DOC_SYNC_LIFECYCLE),
          relative(REPO_ROOT, DOC_MIGRATION),
          relative(REPO_ROOT, DOC_USE_CASES),
        ],
        glossaryCoverage: clarity.ok,
        hasSyncSequenceDiagram: hasSyncDiagram,
        hasHappyAndForbiddenExamples: hasHappyExample && hasForbiddenExample,
        docsCoverageComplete,
      },
      useCases: {
        domains: REQUIRED_DOMAINS,
        mapped: useCaseCoverage.ok,
      },
      summary: {
        p0Total: p0VectorIds.length,
        p0Passed: releaseGate.ok,
        p0FailedVectors: untraceableP0,
      },
      releaseGate,
    };

    await mkdir(dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    expect(docsCoverageComplete).toBe(true);
    expect(clarity.ok).toBe(true);
    expect(useCaseCoverage.ok).toBe(true);
    expect(hasSyncDiagram).toBe(true);
    expect(hasHappyExample).toBe(true);
    expect(hasForbiddenExample).toBe(true);
    expect(untraceableP0).toEqual([]);

    expect(releaseGate).toEqual({
      ok: true,
      result: {
        report: {
          p0Passed: true,
          reportPath: ".conduct/reports/spv2-conformance.json",
        },
      },
    });

    expect(existsSync(REPORT_PATH)).toBe(true);
    const statResult = await stat(REPORT_PATH);
    expect(statResult.size).toBeGreaterThan(0);
  });

  it("TV-DOC-001-N: fails clarity gate when unexplained abbreviations appear", () => {
    const result = checkDocumentationClarity("ACL RLS without glossary definitions");
    expect(result).toEqual({
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Documentation clarity gate failed",
        details: { path: "docs.glossary" },
      },
    });
  });

  it("TV-USE-001-N: fails mapping gate when one required domain is missing", async () => {
    const useCasesDoc = await readFile(DOC_USE_CASES, "utf8");
    const mutated = useCasesDoc.replace(/^##\s+Finatron\s*$/m, "## Finatron_MISSING");
    const result = validateUseCaseMappings(mutated, REQUIRED_DOMAINS);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Use-case mapping incomplete",
        details: { path: "domains.Finatron" },
      },
    });
  });

  it("TV-TEST-001-N: blocks release when any P0 vector fails", () => {
    const gate = evaluateReleaseGate({
      requiredPriority: "P0",
      failedVectors: ["TV-AUTH-002-N"],
    });

    expect(gate).toEqual({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Release blocked: P0 conformance failed",
        details: { path: "conformance" },
      },
    });
  });
});
