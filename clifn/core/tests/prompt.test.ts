import { createPrompt, PromptInputError } from "../src/prompt.js";

describe("prompt", () => {
  it("supports select and multiSelect", async () => {
    const answers = ["2", "1,3"];
    const prompt = createPrompt({
      ask: async () => answers.shift() ?? "",
    });

    const selected = await prompt.select("Choose", ["cursor", "codex", "claude"]);
    const multi = await prompt.multiSelect("Choose many", ["cursor", "codex", "claude"]);

    expect(selected).toBe("codex");
    expect(multi).toEqual(["cursor", "claude"]);
  });

  it("supports text default and confirm", async () => {
    const answers = ["", "yes"];
    const prompt = createPrompt({
      ask: async () => answers.shift() ?? "",
    });

    const text = await prompt.text("Profile", { default: "default" });
    const confirmed = await prompt.confirm("Continue");

    expect(text).toBe("default");
    expect(confirmed).toBe(true);
  });

  it("throws typed error for invalid confirmation", async () => {
    const prompt = createPrompt({
      ask: async () => "maybe",
    });

    await expect(prompt.confirm("Continue")).rejects.toBeInstanceOf(PromptInputError);
  });
});
