import { describe, expect, it } from "vitest";
import { analyzePipelineCompatibility } from "../src/pipeline";

describe("analyzePipelineCompatibility", () => {
  it("treats built-in pipeline options as portable", () => {
    expect(
      analyzePipelineCompatibility({
        enableStemming: true,
        enableEdgeNGrams: true,
        stopWords: ["a", "the"]
      })
    ).toEqual({
      portable: true,
      issues: []
    });
  });

  it("flags custom stages and custom stemmers as non-portable", () => {
    const result = analyzePipelineCompatibility({
      customStages: [
        {
          name: "noop",
          execute: (tokens) => tokens
        }
      ],
      stemmer: {
        stem: (token) => token
      }
    });

    expect(result.portable).toBe(false);
    expect(result.issues.map((issue) => issue.option)).toEqual(["customStages", "stemmer"]);
  });
});
