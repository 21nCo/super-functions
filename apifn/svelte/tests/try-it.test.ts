import { fireEvent, screen, waitFor } from "@testing-library/dom";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import TryIt from "../src/TryIt.svelte";
import type { TryItResponse } from "../src/index.js";

const operation = {
    parameters: [
        { name: "id", in: "path" as const, required: true },
        { name: "search", in: "query" as const },
    ],
    responses: {},
};
let component: TryIt | undefined;
function mount(props: ConstructorParameters<typeof TryIt>[0]["props"]) {
    const target = document.createElement("div");
    document.body.append(target);
    component = new TryIt({ target, props });
    return component;
}
afterEach(() => { component?.$destroy(); component = undefined; document.body.replaceChildren(); });

async function input(placeholder: string, value: string) {
    fireEvent.input(screen.getByPlaceholderText(placeholder), { target: { value } });
    await tick();
}

describe("TryIt consumer state", () => {
    it("reactively builds URL, auth and body, prevents duplicate sends, and emits parsed HTTP error responses", async () => {
        let resolve!: (response: Response) => void;
        const fetchRequest = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
        vi.stubGlobal("fetch", fetchRequest);
        const responses: TryItResponse[] = [];
        mount({ path: "/users/{id}", method: "post", operation, baseUrl: "https://api.test/" }).$on("response", (event) => responses.push(event.detail));
        await input("{id}", "42");
        await input("search", "a & b");
        fireEvent.change(screen.getByRole("combobox"), { target: { value: "bearer" } });
        await tick();
        await input("Bearer token", "secret");
        await input("{}", '{"name":"Ada"}');
        expect((screen.getByDisplayValue("https://api.test/users/42?search=a%20%26%20b") as HTMLInputElement).readOnly).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await tick();
        const sending = screen.getByRole("button", { name: "Sending…" });
        expect((sending as HTMLButtonElement).disabled).toBe(true);
        // A disabled native button cannot initiate another request.
        (sending as HTMLButtonElement).click();
        expect(fetchRequest).toHaveBeenCalledTimes(1);
        expect(fetchRequest).toHaveBeenCalledWith("https://api.test/users/42?search=a%20%26%20b", {
            method: "POST", headers: { Authorization: "Bearer secret", "Content-Type": "application/json" }, body: '{"name":"Ada"}',
        });
        resolve(new Response('{"error":"conflict"}', { status: 409, statusText: "Conflict", headers: { "Content-Type": "application/json", "X-Request-Id": "req-1" } }));
        await waitFor(() => expect(responses).toHaveLength(1));
        expect(responses[0]).toMatchObject({ statusCode: 409, statusText: "Conflict", body: { error: "conflict" }, headers: { "x-request-id": "req-1" } });
        expect(responses[0].durationMs).toBeGreaterThanOrEqual(0);
        await tick();
        expect(screen.getByText(/409 Conflict/)).toBeTruthy();
        expect(screen.getByText(/"error": "conflict"/)).toBeTruthy();
        expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("exposes network and decoding errors without a response event and clears them after a successful retry", async () => {
        const fetchRequest = vi.fn()
            .mockRejectedValueOnce(new Error("connection lost"))
            .mockResolvedValueOnce(new Response("not JSON", { headers: { "Content-Type": "application/json" } }))
            .mockResolvedValueOnce(new Response("recovered", { status: 200, statusText: "OK", headers: { "Content-Type": "text/plain" } }));
        vi.stubGlobal("fetch", fetchRequest);
        const responses: TryItResponse[] = [];
        mount({ path: "/health", method: "get", operation: { responses: {} } }).$on("response", (event) => responses.push(event.detail));
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await screen.findByText("connection lost");
        expect(responses).toHaveLength(0);
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => expect(document.querySelector(".error")?.textContent).toMatch(/JSON|Unexpected/i));
        expect(screen.queryByText("connection lost")).toBeNull();
        expect(responses).toHaveLength(0);
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await screen.findByText("recovered");
        expect(document.querySelector(".error")).toBeNull();
        expect(responses).toHaveLength(1);
        expect(responses[0]).toMatchObject({ statusCode: 200, body: "recovered" });
    });

    it("revalidates displayed URL and available parameter/body inputs on public prop changes", async () => {
        const view = mount({ path: "/users/{id}", method: "post", operation, baseUrl: "https://old.test" });
        await input("{id}", "7");
        view.$set({ path: "/health", method: "get", operation: { responses: {} }, baseUrl: "https://new.test/" });
        await tick();
        expect(screen.getByDisplayValue("https://new.test/health")).toBeTruthy();
        expect(screen.queryByPlaceholderText("{id}")).toBeNull();
        expect(screen.queryByPlaceholderText("{}")).toBeNull();
    });
});
