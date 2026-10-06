import { fireEvent, screen } from "@testing-library/dom";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EndpointMetrics, OpenAPIDocument } from "@apifn/core";
import ApiExplorer from "../src/ApiExplorer.svelte";

const spec: OpenAPIDocument = {
    openapi: "3.1.0", info: { title: "Test API", version: "1.0" },
    paths: {
        "/users": { get: { summary: "List people", tags: ["People"], responses: {} } },
        "/health": { get: { summary: "Service health", responses: {} } },
    },
};
const metric: EndpointMetrics = {
    path: "/users", method: "get", latency: { p50: 12, p95: 40, p99: 80, avg: 20 },
    throughput: { rpm: 320, total: 1000 }, errors: { rate: 0.02, count: 20 },
    availability: 0.98, lastUpdated: "2026-01-01T00:00:00.000Z",
};
let listeners: Set<(event: MediaQueryListEvent) => void>;
let component: ApiExplorer | undefined;
function mount(props: ConstructorParameters<typeof ApiExplorer>[0]["props"]) {
    const target = document.createElement("div");
    document.body.append(target);
    component = new ApiExplorer({ target, props });
    return component;
}
beforeEach(() => {
    listeners = new Set();
    vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: (_name: string, callback: (event: MediaQueryListEvent) => void) => listeners.add(callback),
        removeEventListener: (_name: string, callback: (event: MediaQueryListEvent) => void) => listeners.delete(callback),
    }));
});
afterEach(() => {
    component?.$destroy(); component = undefined;
    document.body.replaceChildren(); vi.useRealTimers();
});

// Flush both promise continuations and Svelte's scheduled DOM updates without a real timer.
async function settle() { await Promise.resolve(); await tick(); }

describe("ApiExplorer subscriptions and reactivity", () => {
    it("opens endpoint responses and switches to a valid response when the selected endpoint changes", async () => {
        mount({ spec: {
            ...spec,
            paths: {
                "/first": { get: { responses: { "201": { description: "Created result" }, "400": { description: "Invalid input" } } } },
                "/second": { get: { responses: { "204": { description: "No response body" } } } },
            },
        } });
        fireEvent.click(screen.getByRole("button", { name: "GET /first" }));
        await tick();
        expect(screen.getByText("Created result")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "400" }));
        await tick();
        expect(screen.getByText("Invalid input")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "GET /second" }));
        await tick();
        expect(screen.getByText("No response body")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "400" })).toBeNull();
    });

    it("filters by summary, refreshes spec props and responds to viewport changes until destroyed", async () => {
        const view = mount({ spec });
        await tick();
        expect(listeners.size).toBe(1);
        fireEvent.input(screen.getByRole("textbox", { name: "Search endpoints" }), { target: { value: "PEOPLE" } });
        await tick();
        expect(screen.getByRole("button", { name: "GET /users" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "GET /health" })).toBeNull();
        fireEvent.input(screen.getByRole("textbox", { name: "Search endpoints" }), { target: { value: "missing" } });
        await tick();
        expect(screen.getByText("No endpoints match")).toBeTruthy();
        fireEvent.input(screen.getByRole("textbox", { name: "Search endpoints" }), { target: { value: "" } });
        view.$set({ spec: { ...spec, info: { title: "Replacement API", version: "2.0" }, paths: { "/new": { post: { responses: {} } } } } });
        await tick();
        expect(screen.getByText("Replacement API")).toBeTruthy();
        expect(screen.getByRole("button", { name: "POST /new" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "GET /users" })).toBeNull();
        listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
        await tick();
        expect(screen.queryByRole("textbox", { name: "Search endpoints" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
        await tick();
        expect(screen.getByRole("textbox", { name: "Search endpoints" })).toBeTruthy();
        view.$destroy(); component = undefined;
        expect(listeners.size).toBe(0);
    });

    it("publishes polled metrics to the UI, revalidates them and cancels its scheduled poll on destroy", async () => {
        vi.useFakeTimers();
        const fetchMetrics = vi.fn().mockResolvedValueOnce([metric]).mockResolvedValue([]);
        const view = mount({ spec, watchfn: { fetchMetrics }, watchfnInterval: 1000 });
        await settle();
        expect(screen.getByTitle("Performance data available")).toBeTruthy();
        await vi.advanceTimersByTimeAsync(999); await tick();
        expect(fetchMetrics).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1); await tick();
        expect(fetchMetrics).toHaveBeenCalledTimes(2);
        expect(screen.queryByTitle("Performance data available")).toBeNull();
        view.$destroy(); component = undefined;
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(5000);
        expect(fetchMetrics).toHaveBeenCalledTimes(2);
        expect(listeners.size).toBe(0);
    });

    it("does not publish or reschedule an in-flight metrics result after destruction", async () => {
        vi.useFakeTimers();
        let resolve!: (metrics: EndpointMetrics[]) => void;
        const fetchMetrics = vi.fn(() => new Promise<EndpointMetrics[]>((done) => { resolve = done; }));
        const view = mount({ spec, watchfn: { fetchMetrics } });
        await tick();
        view.$destroy(); component = undefined;
        resolve([metric]); await settle();
        expect(screen.queryByTitle("Performance data available")).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(20000);
        expect(fetchMetrics).toHaveBeenCalledTimes(1);
        expect(listeners.size).toBe(0);
    });

    it("recovers from a rejected metrics poll and publishes the next result", async () => {
        vi.useFakeTimers();
        const failure = new Error("metrics unavailable");
        const fetchMetrics = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue([metric]);
        mount({ spec, watchfn: { fetchMetrics }, watchfnInterval: 1000 });
        await settle();
        expect(screen.queryByTitle("Performance data available")).toBeNull();
        await vi.advanceTimersByTimeAsync(1000); await tick();
        expect(screen.getByTitle("Performance data available")).toBeTruthy();
        expect(fetchMetrics).toHaveBeenCalledTimes(2);
    });
});
