import { ValidationError } from "../core/errors.js";

export interface DatasetItem {
  input: string;
  expected: string;
  metadata?: Record<string, unknown>;
  id?: string;
}

export class EvaluationDataset {
  readonly items: DatasetItem[];

  constructor(items: DatasetItem[]) {
    if (!items.length) {
      throw new ValidationError("evaluation dataset must contain at least one item");
    }
    this.items = items.map((item, index) => ({
      ...item,
      id: item.id ?? `dataset-item-${index + 1}`,
      metadata: item.metadata ?? {}
    }));
  }

  static from(items: DatasetItem[]): EvaluationDataset {
    return new EvaluationDataset(items);
  }
}
