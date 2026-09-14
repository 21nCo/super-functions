export function countTokens(text: string, model: string = "gpt-4"): number {
  void model; // The portable heuristic is model-independent.
  // Simple estimation: ~4 characters per token for English
  // In a real implementation, we would use js-tiktoken
  return Math.ceil(text.length / 4);
}

export function countMessagesTokens(messages: any[], model: string = "gpt-4"): number {
  let total = 0;
  for (const msg of messages) {
    total += countTokens(msg.content || "", model);
    total += 4; // metadata overhead
  }
  return total + 3; // response overhead
}
