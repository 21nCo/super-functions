import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EndpointMetrics, OpenAPIDocument } from "@apifn/core";
import { ApiExplorer } from "../src/index.js";

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

beforeEach(() => {
    listeners = new Set();
    vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: (_name: string, callback: (event: MediaQueryListEvent) => void) => listeners.add(callback),
        removeEventListener: (_name: string, callback: (event: MediaQueryListEvent) => void) => listeners.delete(callback),
    }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("ApiExplorer lifecycle", () => {
    it("filters by summary, refreshes spec props and responds to viewport changes until unmounted", () => {
        const { rerender, unmount } = render(<ApiExplorer spec={spec} />);
        expect(listeners.size).toBe(1);
        fireEvent.change(screen.getByRole("textbox", { name: "Search endpoints" }), { target: { value: "PEOPLE" } });
        expect(screen.getByRole("button", { name: "get /users" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "get /health" })).toBeNull();
        fireEvent.change(screen.getByRole("textbox", { name: "Search endpoints" }), { target: { value: "missing" } });
        expect(screen.getByText("No endpoints match")).toBeTruthy();
        fireEvent.change(screen.getByRole("textbox", { name: "Search endpoints" }), { target: { value: "" } });
        rerender(<ApiExplorer spec={{ ...spec, info: { title: "Replacement API", version: "2.0" }, paths: { "/new": { post: { responses: {} } } } }} />);
        expect(screen.getByText("Replacement API")).toBeTruthy();
        expect(screen.getByRole("button", { name: "post /new" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "get /users" })).toBeNull();
        act(() => listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent)));
        expect(screen.queryByRole("textbox", { name: "Search endpoints" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
        expect(screen.getByRole("textbox", { name: "Search endpoints" })).toBeTruthy();
        unmount();
        expect(listeners.size).toBe(0);
    });

    it("updates observable metric badges on polling, clears removed metrics and cancels its timer on unmount", async () => {
        vi.useFakeTimers();
        const fetchMetrics = vi.fn().mockResolvedValueOnce([metric]).mockResolvedValue([]);
        const { unmount } = render(<ApiExplorer spec={spec} watchfn={{ fetchMetrics }} watchfnInterval={1000} />);
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByTitle("Performance data available")).toBeTruthy();
        await act(async () => { await vi.advanceTimersByTimeAsync(999); });
        expect(fetchMetrics).toHaveBeenCalledTimes(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        expect(fetchMetrics).toHaveBeenCalledTimes(2);
        expect(screen.queryByTitle("Performance data available")).toBeNull();
        unmount();
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(5000);
        expect(fetchMetrics).toHaveBeenCalledTimes(2);
    });

    it("ignores an obsolete metrics request after the client changes and ignores pending work after unmount", async () => {
        vi.useFakeTimers();
        let resolveOld!: (metrics: EndpointMetrics[]) => void;
        const oldClient = { fetchMetrics: vi.fn(() => new Promise<EndpointMetrics[]>((resolve) => { resolveOld = resolve; })) };
        let resolveNew!: (metrics: EndpointMetrics[]) => void;
        const newClient = { fetchMetrics: vi.fn(() => new Promise<EndpointMetrics[]>((resolve) => { resolveNew = resolve; })) };
        const { rerender, unmount } = render(<ApiExplorer spec={spec} watchfn={oldClient} />);
        rerender(<ApiExplorer spec={spec} watchfn={newClient} />);
        await act(async () => { resolveOld([metric]); });
        expect(screen.queryByTitle("Performance data available")).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        unmount();
        await act(async () => { resolveNew([metric]); });
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(20000);
        expect(oldClient.fetchMetrics).toHaveBeenCalledTimes(1);
        expect(newClient.fetchMetrics).toHaveBeenCalledTimes(1);
        expect(listeners.size).toBe(0);
    });

    it("recovers from a metrics failure on the next poll rather than stopping updates", async () => {
        vi.useFakeTimers();
        const failure = new Error("metrics unavailable");
        const fetchMetrics = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue([metric]);
        render(<ApiExplorer spec={spec} watchfn={{ fetchMetrics }} watchfnInterval={1000} />);
        await act(async () => { await Promise.resolve(); });
        expect(screen.queryByTitle("Performance data available")).toBeNull();
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(screen.getByTitle("Performance data available")).toBeTruthy();
        expect(fetchMetrics).toHaveBeenCalledTimes(2);
    });
});
