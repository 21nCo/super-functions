import { ValidationError } from "../core/errors.js";
import { Message } from "../core/types.js";

export class BufferMemory {
  private messages: Message[] = [];
  readonly maxMessages: number;

  constructor(options: { maxMessages?: number } = {}) {
    this.maxMessages = options.maxMessages ?? 10;
    if (this.maxMessages < 0) {
      throw new ValidationError("BufferMemory maxMessages must be non-negative", {
        metadata: { maxMessages: this.maxMessages }
      });
    }
  }

  async add(message: Message): Promise<void> {
    this.messages.push({ ...message });
    if (this.maxMessages === 0) {
      this.messages = [];
      return;
    }
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  async extend(messages: Message[]): Promise<void> {
    for (const message of messages) {
      await this.add(message);
    }
  }

  async get(): Promise<Message[]> {
    return this.messages.map((message) => ({ ...message }));
  }

  async clear(): Promise<void> {
    this.messages = [];
  }
}
