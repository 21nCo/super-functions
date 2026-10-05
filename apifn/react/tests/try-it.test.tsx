import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TryIt } from "../src/index.js";
import type { TryItResponse } from "../src/index.js";

const operation = {
    parameters: [
        { name: "id", in: "path" as const, required: true },
        { name: "search", in: "query" as const },
    ],
    responses: {},
};

afterEach(() => cleanup());

describe("TryIt consumer state", () => {
    it("builds the edited URL, auth and body, disables duplicate sends, and renders a parsed HTTP error response", async () => {
        let resolve!: (response: Response) => void;
        const fetchRequest = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
        vi.stubGlobal("fetch", fetchRequest);
        const onResponse = vi.fn<(response: TryItResponse) => void>();
        render(<TryIt path="/users/{id}" method="post" operation={operation} baseUrl="https://api.test/" onResponse={onResponse} />);

        fireEvent.change(screen.getByPlaceholderText("{id}"), { target: { value: "42" } });
        fireEvent.change(screen.getByPlaceholderText("search"), { target: { value: "a & b" } });
        fireEvent.change(screen.getByRole("combobox"), { target: { value: "bearer" } });
        fireEvent.change(screen.getByPlaceholderText("Bearer token"), { target: { value: "secret" } });
        fireEvent.change(screen.getByPlaceholderText("{}"), { target: { value: '{"name":"Ada"}' } });
        expect((screen.getByDisplayValue("https://api.test/users/42?search=a%20%26%20b") as HTMLInputElement).readOnly).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        const sending = screen.getByRole("button", { name: "Sending…" });
        expect((sending as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(sending);
        expect(fetchRequest).toHaveBeenCalledTimes(1);
        expect(fetchRequest).toHaveBeenCalledWith("https://api.test/users/42?search=a%20%26%20b", {
            method: "POST", headers: { Authorization: "Bearer secret", "Content-Type": "application/json" }, body: '{"name":"Ada"}',
        });

        resolve(new Response('{"error":"conflict"}', { status: 409, statusText: "Conflict", headers: { "Content-Type": "application/json", "X-Request-Id": "req-1" } }));
        await waitFor(() => expect(onResponse).toHaveBeenCalledTimes(1));
        expect(onResponse.mock.calls[0][0]).toMatchObject({ statusCode: 409, statusText: "Conflict", body: { error: "conflict" }, headers: { "x-request-id": "req-1" } });
        expect(onResponse.mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(0);
        expect(screen.getByText(/409 Conflict/)).toBeTruthy();
        expect(screen.getByText(/"error": "conflict"/)).toBeTruthy();
        expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("renders network and JSON decoding errors without emitting a response, then clears the error on retry", async () => {
        const fetchRequest = vi.fn()
            .mockRejectedValueOnce(new Error("connection lost"))
            .mockResolvedValueOnce(new Response("not JSON", { headers: { "Content-Type": "application/json" } }))
            .mockResolvedValueOnce(new Response("recovered", { status: 200, statusText: "OK", headers: { "Content-Type": "text/plain" } }));
        vi.stubGlobal("fetch", fetchRequest);
        const onResponse = vi.fn();
        render(<TryIt path="/health" method="get" operation={{ responses: {} }} onResponse={onResponse} />);
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await screen.findByText("connection lost");
        expect(onResponse).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => expect(fetchRequest).toHaveBeenCalledTimes(2));
        await waitFor(() => expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false));
        expect(screen.queryByText("connection lost")).toBeNull();
        expect(onResponse).not.toHaveBeenCalled();
        // Decoding failure is observable in the rendered error, not merely a rejected mock.
        expect(document.body.textContent).toMatch(/JSON|Unexpected/i);
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await screen.findByText("recovered");
        expect(document.body.textContent).not.toMatch(/Unexpected/);
        expect(onResponse).toHaveBeenCalledTimes(1);
        expect(onResponse.mock.calls[0][0]).toMatchObject({ statusCode: 200, body: "recovered" });
    });

    it("recomputes URL and available inputs when endpoint props change", () => {
        const { rerender } = render(<TryIt path="/users/{id}" method="post" operation={operation} baseUrl="https://old.test" />);
        fireEvent.change(screen.getByPlaceholderText("{id}"), { target: { value: "7" } });
        rerender(<TryIt path="/health" method="get" operation={{ responses: {} }} baseUrl="https://new.test/" />);
        expect(screen.getByDisplayValue("https://new.test/health")).toBeTruthy();
        expect(screen.queryByPlaceholderText("{id}")).toBeNull();
        expect(screen.queryByPlaceholderText("{}")).toBeNull();
    });
});
