# LangFn Provider Compatibility

This unpublished TypeScript adoption has the following adapter capabilities. Python remains in the separately maintained next snapshot; its Google adapter has not received these changes.

| Provider | completion | chat | streaming | tools | embeddings | evaluation | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| openai | yes | yes | yes | yes | yes | yes | Native streamed chat completions plus first-party embeddings. |
| anthropic | yes | yes | yes | yes | no | yes | Native streamed messages API with tool-use support. |
| ollama | yes | yes | yes | no | no | yes | Local model adapter; streaming is supported, tool mapping is not first-party. |
| google | yes | yes | yes | yes | no | yes | Native REST/SSE, signed tool continuation and cancellation. Live qualification is separate. |
| mistral | yes | yes | yes | yes | no | yes | Tool-call mapping is supported on chat completions. |

## Notes

- Evaluation support means the provider can be exercised through `LangFn` evaluators once the model is configured.
- `custom` and `mock` remain available for SPI and deterministic test flows, but they are not part of the first-party release matrix above.
- Only OpenAI ships a first-party embeddings adapter in `0.1.0`.

## SFNS-4 TypeScript adoption

The dev adoption targets the TypeScript package. Its Google adapter now supports native SSE, tool calling and signed continuation through `chat` and `streamChat`. Python has not been migrated in this dev worktree. Live model verification is a separate release gate. Consumers persist the returned assistant `message` (or the stream `message` event), including providerData, before appending tool results. `stream` remains the prompt-only convenience method.
