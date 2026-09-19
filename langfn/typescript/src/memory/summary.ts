import { LangFn } from "../client.js";
import { ValidationError } from "../core/errors.js";
import { Message } from "../core/types.js";

type Summarizer = (payload: { existingSummary: string | undefined; messages: Message[] }) => Promise<string> | string;

export class SummaryMemory {
  private messages: Message[] = [];
  private summary?: string;
  readonly maxMessages: number;
  private readonly summarizer?: Summarizer;
  private readonly summaryPrompt: string;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly lang?: LangFn,
    options: { maxMessages?: number; summaryPrompt?: string; summarizer?: Summarizer } = {}
  ) {
    this.maxMessages = options.maxMessages ?? 10;
    if (!Number.isSafeInteger(this.maxMessages) || this.maxMessages < 0) {
      throw new ValidationError("SummaryMemory maxMessages must be a non-negative safe integer", {
        metadata: { maxMessages: this.maxMessages }
      });
    }
    this.summaryPrompt =
      options.summaryPrompt ??
      "Summarize the following conversation history concisely, retaining all key information:";
    this.summarizer = options.summarizer;
  }

  async add(message: Message): Promise<void> {
    await this.enqueueMutation(async () => {
      this.messages.push({ ...message });
      await this.compactIfNeeded();
    });
  }

  async extend(messages: Message[]): Promise<void> {
    for (const message of messages) {
      await this.add(message);
    }
  }

  async get(): Promise<Message[]> {
    await this.mutationTail;
    const history: Message[] = [];
    if (this.summary) {
      history.push({ role: "system", content: `Previous conversation summary: ${this.summary}` });
    }
    history.push(...this.messages.map((message) => ({ ...message })));
    return history;
  }

  getSummary(): string | undefined {
    return this.summary;
  }

  async clear(): Promise<void> {
    await this.enqueueMutation(async () => {
      this.messages = [];
      this.summary = undefined;
    });
  }

  private async enqueueMutation(mutation: () => Promise<void>): Promise<void> {
    const next = this.mutationTail.then(mutation, mutation);
    this.mutationTail = next.catch(() => undefined);
    await next;
  }

  private async compactIfNeeded(): Promise<void> {
    if (this.messages.length <= this.maxMessages) {
      return;
    }

    const overflowCount = this.messages.length - this.maxMessages;
    const toSummarize = this.messages.slice(0, overflowCount);
    this.summary = await this.createSummary(toSummarize);
    this.messages = this.messages.slice(overflowCount);
  }

  private async createSummary(messages: Message[]): Promise<string> {
    if (this.summarizer) {
      return await this.summarizer({ existingSummary: this.summary, messages });
    }
    if (!this.lang) {
      return [this.summary, ...messages.map((message) => `${message.role}: ${message.content}`)]
        .filter(Boolean)
        .join("\n");
    }

    const prompt = [
      this.summaryPrompt,
      "",
      `Existing Summary: ${this.summary ?? "None"}`,
      "",
      "New Messages:",
      ...messages.map((message) => `${message.role}: ${message.content}`)
    ].join("\n");
    const response = await this.lang.complete(prompt);
    return response.content;
  }
}
