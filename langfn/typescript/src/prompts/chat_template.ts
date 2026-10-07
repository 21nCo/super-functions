import type { Message } from "../core/types.js";
import { PromptTemplate, type PromptVariables } from "./template.js";

export interface ChatMessageTemplate {
  role: Message["role"];
  content: string;
}

export interface ChatTemplateConfig {
  messages: ChatMessageTemplate[];
}

export class ChatTemplate {
  readonly messages: readonly ChatMessageTemplate[];

  constructor(config: ChatTemplateConfig | ChatMessageTemplate[]) {
    this.messages = [...(Array.isArray(config) ? config : config.messages)];
  }

  static from_messages(messages: Array<[Message["role"], string]>): ChatTemplate {
    return new ChatTemplate(messages.map(([role, content]) => ({ role, content })));
  }

  formatMessages(variables: PromptVariables = {}): Message[] {
    return this.messages.map((message) => ({
      role: message.role,
      content: new PromptTemplate(message.content).format(variables)
    }));
  }

  format(variables: PromptVariables = {}): Message[] {
    return this.formatMessages(variables);
  }
}

export const ChatPromptTemplate = ChatTemplate;
