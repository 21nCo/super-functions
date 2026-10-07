import { ToolPolicyViolationError } from "../core/errors.js";
import { Tool, type ToolSchema } from "./base.js";

export interface CalculatorArgs {
  expression: string;
}

const calculatorSchema: ToolSchema<CalculatorArgs> = {
  jsonSchema: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "The mathematical expression to evaluate."
      }
    },
    required: ["expression"]
  },
  parse(data: unknown): CalculatorArgs {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Expected calculator args object");
    }
    const expression = (data as Record<string, unknown>).expression;
    if (typeof expression !== "string") {
      throw new Error("Expected expression to be a string");
    }
    return { expression };
  }
};

export function calculator(expression: string): string {
  const parser = new CalculatorParser(expression);
  return String(parser.parse());
}

class CalculatorParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): number {
    const value = this.parseAdditive();
    this.skipWhitespace();
    if (this.index !== this.source.length) {
      this.fail("Calculator expression uses a disallowed grammar");
    }
    return value;
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    while (true) {
      this.skipWhitespace();
      if (this.consume("+")) {
        value += this.parseMultiplicative();
        continue;
      }
      if (this.consume("-")) {
        value -= this.parseMultiplicative();
        continue;
      }
      return value;
    }
  }

  private parseMultiplicative(): number {
    let value = this.parseExponent();
    while (true) {
      this.skipWhitespace();
      if (this.consume("//")) {
        value = Math.floor(value / this.parseExponent());
        continue;
      }
      if (this.consume("*")) {
        value *= this.parseExponent();
        continue;
      }
      if (this.consume("/")) {
        value /= this.parseExponent();
        continue;
      }
      if (this.consume("%")) {
        value %= this.parseExponent();
        continue;
      }
      return value;
    }
  }

  private parseExponent(): number {
    let value = this.parseUnary();
    this.skipWhitespace();
    if (this.consume("**")) {
      value = value ** this.parseExponent();
    }
    return value;
  }

  private parseUnary(): number {
    this.skipWhitespace();
    if (this.consume("+")) {
      return this.parseUnary();
    }
    if (this.consume("-")) {
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipWhitespace();
    if (this.consume("(")) {
      const value = this.parseAdditive();
      this.skipWhitespace();
      if (!this.consume(")")) {
        this.fail("Calculator expression uses a disallowed grammar");
      }
      return value;
    }

    const number = this.readNumber();
    if (number !== undefined) {
      return number;
    }

    this.fail("Calculator expression uses a disallowed grammar");
  }

  private readNumber(): number | undefined {
    this.skipWhitespace();
    const match = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(this.source.slice(this.index));
    if (!match) {
      return undefined;
    }
    this.index += match[0].length;
    return Number(match[0]);
  }

  private consume(token: string): boolean {
    if (this.source.slice(this.index, this.index + token.length) === token) {
      this.index += token.length;
      return true;
    }
    return false;
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length && /\s/.test(this.source[this.index]!)) {
      this.index += 1;
    }
  }

  private fail(message: string): never {
    throw new ToolPolicyViolationError(message, {
      metadata: { expression: this.source }
    });
  }
}

export const CalculatorTool = new Tool<CalculatorArgs, string>({
  name: "calculator",
  description: "Perform basic mathematical calculations.",
  schema: calculatorSchema,
  execute: async (args) => calculator(args.expression)
});
