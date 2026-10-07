import { PromptTemplate, type PromptVariables } from "./template.js";

export interface FewShotExample {
  input: string;
  output: string;
}

export interface FewShotPromptConfig {
  prefix: string;
  examples: FewShotExample[];
  suffix: string;
  inputVariables?: string[];
  exampleSeparator?: string;
}

export class FewShotPrompt {
  readonly prefix: string;
  readonly examples: readonly FewShotExample[];
  readonly suffix: string;
  readonly inputVariables?: readonly string[];
  readonly exampleSeparator: string;
  private readonly exampleTemplate = new PromptTemplate("Input: {input}\nOutput: {output}");

  constructor(config: FewShotPromptConfig) {
    this.prefix = config.prefix;
    this.examples = [...config.examples];
    this.suffix = config.suffix;
    this.inputVariables = config.inputVariables ? [...config.inputVariables] : undefined;
    this.exampleSeparator = config.exampleSeparator ?? "\n\n";
  }

  format(variables: PromptVariables = {}): string {
    const parts = [
      new PromptTemplate(this.prefix).format(variables),
      ...this.examples.map((example) => this.exampleTemplate.format({ ...example })),
      new PromptTemplate({
        template: this.suffix,
        variables: this.inputVariables ? [...this.inputVariables] : undefined
      }).format(variables)
    ];
    return parts.join(this.exampleSeparator);
  }
}
