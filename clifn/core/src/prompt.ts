import readline from "node:readline";

export class PromptInputError extends Error {
  readonly code = "CLIFN_PROMPT_INPUT_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "PromptInputError";
  }
}

type AskFn = (label: string) => Promise<string>;

export interface PromptApi {
  select<T extends string>(label: string, choices: T[]): Promise<T>;
  multiSelect<T extends string>(label: string, choices: T[]): Promise<T[]>;
  text(label: string, options?: { default?: string }): Promise<string>;
  confirm(label: string): Promise<boolean>;
}

function assertChoices(choices: readonly string[]): void {
  if (choices.length === 0) {
    throw new PromptInputError("choices cannot be empty");
  }
}

function createReadlineAskFn(): AskFn {
  return async (label: string): Promise<string> => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return await new Promise((resolve) => {
      rl.question(label, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  };
}

function resolveChoice<T extends string>(value: string, choices: readonly T[]): T {
  const trimmed = value.trim();
  const byLabel = choices.find((choice) => choice === trimmed);
  if (byLabel) {
    return byLabel;
  }
  const idx = Number(trimmed);
  if (Number.isInteger(idx) && idx >= 1 && idx <= choices.length) {
    return choices[idx - 1];
  }
  throw new PromptInputError(`invalid selection "${value}"`);
}

export function createPrompt(options?: { ask?: AskFn }): PromptApi {
  const ask = options?.ask ?? createReadlineAskFn();

  return {
    async select<T extends string>(label: string, choices: T[]): Promise<T> {
      assertChoices(choices);
      const menu = choices.map((choice, idx) => `${idx + 1}) ${choice}`).join(", ");
      const input = await ask(`${label} [${menu}]: `);
      return resolveChoice(input, choices);
    },
    async multiSelect<T extends string>(label: string, choices: T[]): Promise<T[]> {
      assertChoices(choices);
      const menu = choices.map((choice, idx) => `${idx + 1}) ${choice}`).join(", ");
      const input = await ask(`${label} [${menu}] (comma-separated): `);
      const tokens = input
        .split(",")
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
      if (tokens.length === 0) {
        return [];
      }
      const selected = tokens.map((token) => resolveChoice(token, choices));
      return Array.from(new Set(selected));
    },
    async text(label: string, options?: { default?: string }): Promise<string> {
      const input = await ask(`${label}: `);
      const trimmed = input.trim();
      if (trimmed.length === 0 && options?.default !== undefined) {
        return options.default;
      }
      return trimmed;
    },
    async confirm(label: string): Promise<boolean> {
      const input = (await ask(`${label} [y/n]: `)).trim().toLowerCase();
      if (input === "y" || input === "yes") {
        return true;
      }
      if (input === "n" || input === "no") {
        return false;
      }
      throw new PromptInputError(`invalid confirmation "${input}"`);
    },
  };
}

export const prompt: PromptApi = createPrompt();
