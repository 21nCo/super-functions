import { it, expect, vi } from "vitest";
import { LangFn } from "../src/client.js";
import { createLangFnRouter } from "../src/http/routes.js";
import { AnthropicChatModel } from "../src/models/anthropic.js";
import { MistralChatModel } from "../src/models/mistral.js";

it.each(["anthropic", "mistral"])("round-trips canonical tool continuation over HTTP for %s", async provider => {
  const anthropic = provider === "anthropic";
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(Response.json(anthropic ? { content: [{ type: "tool_use", id: "call12345", name: "lookup", input: { q: "x" } }] } : { choices: [{ message: { content: "", tool_calls: [{ id: "call12345", type: "function", function: { name: "lookup", arguments: '{"q":"x"}' } }] } }] }))
    .mockResolvedValueOnce(Response.json(anthropic ? { content: [{ type: "text", text: "done" }] } : { choices: [{ message: { content: "done" } }] }));
  const model = anthropic ? new AnthropicChatModel({ apiKey: "fixture", fetchImpl }) : new MistralChatModel({ apiKey: "fixture", fetchImpl });
  const router = createLangFnRouter(new LangFn({ model }));
  const chat = (messages: unknown[]) => router.handle(new Request("https://test/chat", { method: "POST", body: JSON.stringify({ messages }) }));
  const first = await (await chat([{ role: "user", content: "lookup" }])).json();
  expect(first.data.message.toolCalls[0].id).toBe("call12345");
  const second = await chat([{ role: "user", content: "lookup" }, first.data.message, { role: "tool", content: "result", tool_call_id: "call12345" }]);
  expect(second.status).toBe(200);
  const wire = JSON.parse(fetchImpl.mock.calls[1][1].body);
  expect(JSON.stringify(wire)).not.toContain('"toolCalls"');
  if (anthropic) {
    expect(wire.messages[1].content).toEqual([{ type: "tool_use", id: "call12345", name: "lookup", input: { q: "x" } }]);
    expect(wire.messages[2].content[0].tool_use_id).toBe("call12345");
  } else {
    expect(wire.messages[1].tool_calls[0]).toEqual({ id: "call12345", type: "function", function: { name: "lookup", arguments: '{"q":"x"}' } });
    expect(wire.messages[2].tool_call_id).toBe("call12345");
  }
});
