import * as path from "path";
import * as fs from "fs";
import type {
    TestCase,
    TestResult,
    RunOptions,
    TestStatus,
    TestError,
    TestProgress,
} from "@testfn/core";
import { BaseAdapter } from "@testfn/core";

// Duck-typing collection types to avoid circular dependency
interface CollectionItem { kind: string; name: string; children?: CollectionItem[];[key: string]: any; }
interface CollectionInfo { name: string;[key: string]: any; }
interface Collection { info: CollectionInfo; items: CollectionItem[]; environments: Record<string, any>;[key: string]: any; }
interface AssertionResult { passed: boolean; name: string;[key: string]: any; }
interface RequestResult { name: string; status: "passed" | "failed" | "error" | "skipped"; duration: number; assertions: AssertionResult[]; error?: string; statusCode?: number;[key: string]: any; }
interface RunReport { results: RequestResult[];[key: string]: any; }

export class ApifnTestAdapter extends BaseAdapter {
    name = "apifn";

    supports(framework: string): boolean {
        return framework.toLowerCase() === "apifn";
    }

    async discover(patterns: string[]): Promise<TestCase[]> {
        // Dynamic import to avoid circular dependency
        let glob: ((pattern: string | string[], options?: { absolute?: boolean }) => Promise<string[]>) | undefined;
        try {
            // @testfn/core depends on fast-glob, so reuse it when available.
            const fg = await import("fast-glob");
            glob = (fg as any).default ?? (fg as any);
        } catch {
            console.warn("[apifn/testfn] fast-glob not found, using basic fs discovery");
        }

        // @ts-ignore
        const { readCollection } = await import("@apifn/collections");
        const testCases: TestCase[] = [];
        const discoveredDirs = new Set<string>();

        for (const pattern of patterns) {
            if (glob) {
                // Find opencollection.yml files matching the pattern
                const files: string[] = await glob(
                    pattern.endsWith(".yml") || pattern.endsWith(".yaml")
                        ? pattern
                        : `${pattern}/**/opencollection.yml`,
                    { absolute: true }
                );
                for (const f of files) {
                    discoveredDirs.add(path.dirname(f));
                }
            } else {
                // Fallback if no glob (unlikely since testfn has it)
                try {
                    if (fs.existsSync(pattern)) {
                        const stat = fs.statSync(pattern);
                        if (stat.isDirectory()) {
                            if (fs.existsSync(path.join(pattern, "opencollection.yml"))) {
                                discoveredDirs.add(pattern);
                            }
                        } else if (pattern.endsWith("opencollection.yml")) {
                            discoveredDirs.add(path.dirname(pattern));
                        }
                    }
                } catch {
                    // ignore
                }
            }
        }

        for (const dir of discoveredDirs) {
            try {
                const collection: Collection = await readCollection(dir);

                // Walk collection to emit test cases
                const walk = (items: CollectionItem[], suitePath: string[]) => {
                    for (const item of items) {
                        if (item.kind === "request") {
                            const suiteName = suitePath.length > 0 ? suitePath.join(" > ") : collection.info.name;
                            testCases.push({
                                id: this.generateTestId(dir, item.name, suiteName),
                                file: dir,
                                name: item.name,
                                suite: suiteName,
                                tags: ["api"],
                            });
                        } else if (item.kind === "folder" && item.children) {
                            walk(item.children, [...suitePath, item.name]);
                        }
                    }
                };

                walk(collection.items, []);
            } catch (err) {
                console.warn(`[apifn/testfn] Failed to read collection at ${dir}:`, err);
            }
        }

        return testCases;
    }

    async run(tests: TestCase[], options: RunOptions): Promise<TestResult[]> {
        // @ts-ignore
        const { runCollection, readCollection } = await import("@apifn/collections");
        const results: TestResult[] = [];

        // Group tests by collection file/directory
        const collectionsToRun = new Map<string, TestCase[]>();
        for (const t of tests) {
            const list = collectionsToRun.get(t.file) || [];
            list.push(t);
            collectionsToRun.set(t.file, list);
        }

        let completedCount = 0;
        const updateProgress = (tc: TestCase) => {
            completedCount++;
            options.onProgress?.({
                completed: completedCount,
                total: tests.length,
                current: tc,
            });
        };

        for (const [dir, testsInCollection] of collectionsToRun.entries()) {
            try {
                const collection = await readCollection(dir);

                // We need to run the collection, but ideally only the mapped tests.
                // For simplicity, we run the collection with 'include' filter based on matched paths.
                // Since testfn focuses on names, we map names back to items.
                // Or we just run the whole collection and filter the output (if it's fast enough).
                // Best approach: Use `include` with the paths of the requests.
                const report: RunReport = await runCollection(collection, {
                    // Default to the first environment or a dummy one if none exists
                    environment: Object.keys(collection.environments)[0] ?? "default",
                    parallel: options.parallel !== undefined && options.parallel > 1,
                    concurrency: typeof options.parallel === "number" ? options.parallel : undefined,
                    timeout: options.timeout,
                    retries: options.retries,
                    overrides: options.env,
                });

                // Map collection results to testfn TestResults
                for (const reqRes of report.results) {
                    // Match by request name (testfn test case granularity is per request name).
                    const matchedTests = testsInCollection.filter((t) => t.name === reqRes.name);
                    for (const tc of matchedTests) {
                        let status: TestStatus = "passed";
                        let testError: TestError | undefined;

                        if (reqRes.status === "failed" || reqRes.status === "error") {
                            status = "failed";

                            if (reqRes.status === "failed") {
                                const failedAsserts = reqRes.assertions.filter((a: any) => !a.passed);
                                const msg = failedAsserts.map((a: any) => `- ${a.name}`).join("\n");
                                testError = {
                                    message: `Assertions failed:\n${msg}`,
                                };
                            } else if (reqRes.status === "error") {
                                testError = {
                                    message: reqRes.error || "Unknown Request Error",
                                    actual: reqRes.statusCode,
                                };
                            }
                        } else if (reqRes.status === "skipped") {
                            status = "skipped";
                        }

                        results.push({
                            id: tc.id,
                            status,
                            duration: reqRes.duration,
                            error: testError,
                        });
                        updateProgress(tc);
                    }
                }

                // Handle skipped/omitted tests from collection that were requested
                const runTestNames = new Set(report.results.map((r: RequestResult) => r.name));
                for (const tc of testsInCollection) {
                    if (!runTestNames.has(tc.name)) {
                        results.push({
                            id: tc.id,
                            status: "skipped",
                            duration: 0,
                            error: { message: "Test not found or excluded in collection run" },
                        });
                        updateProgress(tc);
                    }
                }
            } catch (err) {
                // Collection load or execution failure applies error to all tests in it
                for (const tc of testsInCollection) {
                    results.push({
                        id: tc.id,
                        status: "failed",
                        duration: 0,
                        error: {
                            message: err instanceof Error ? err.message : String(err),
                            stack: err instanceof Error ? err.stack : undefined,
                        },
                    });
                    updateProgress(tc);
                }
            }
        }

        return results;
    }
}
