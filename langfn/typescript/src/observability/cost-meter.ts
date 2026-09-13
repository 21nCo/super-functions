import { TokenUsage, Cost } from "../core/types.js";

export interface modelCost {
  prompt: number; // per 1k tokens
  completion: number; // per 1k tokens
}

export interface Budgets {
  perRequestUsd?: number;
}

const COST_MAP: Record<string, Record<string, modelCost>> = {
  openai: {
    "gpt-4": { prompt: 0.03, completion: 0.06 },
    "gpt-4-turbo-preview": { prompt: 0.01, completion: 0.03 },
    "gpt-4o": { prompt: 0.005, completion: 0.015 },
    "gpt-4o-mini": { prompt: 0.00015, completion: 0.0006 },
    "gpt-3.5-turbo": { prompt: 0.0005, completion: 0.0015 }
  },
  anthropic: {
    "claude-3-opus-20240229": { prompt: 0.015, completion: 0.075 },
    "claude-3-sonnet-20240229": { prompt: 0.003, completion: 0.015 },
    "claude-3-haiku-20240307": { prompt: 0.00025, completion: 0.00125 }
  }
};

export class CostMeter {
  private readonly prices: Record<string, Record<string, modelCost>>;

  constructor(options: { prices?: Record<string, Record<string, modelCost>> } = {}) {
    this.prices = options.prices ?? COST_MAP;
  }

  estimate(provider: string, model: string, usage: TokenUsage): Cost {
    const rates = this.prices[provider]?.[model] || { prompt: 0, completion: 0 };

    const promptCost = (usage.prompt_tokens / 1000) * rates.prompt;
    const completionCost = (usage.completion_tokens / 1000) * rates.completion;

    return {
      input: promptCost,
      output: completionCost,
      total: promptCost + completionCost,
      currency: "USD"
    };
  }
}
