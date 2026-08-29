import { describe, expect, it } from "vitest";
import { createEditor } from "@mdfn/core";
import { createMarkdownProjector } from "@mdfn/markdown";
import { createAuthoringModel, createToolbarModel, filterSlashCommands, insertMarkdownAtSelection, runToolbarAction } from "./index";

describe("toolbar model", () => {
  it("reports actual history availability", () => {
    const controller = createEditor({ markdown: "before", projector: createMarkdownProjector() });
    expect(createToolbarModel(controller).groups[0]?.actions[0]?.disabled).toBe(true);
  });

  it("routes formatting and history actions to an active surface", () => {
    const controller = createEditor({ markdown: "before", projector: createMarkdownProjector() });
    const calls: string[] = [];
    const target = { can: () => true, run: (command: string) => { calls.push(command); return true; } };
    const model = createToolbarModel(controller, undefined, undefined, target);
    const bold = model.groups.flatMap((group) => group.actions).find((action) => action.id === "bold")!;
    const undo = model.groups.flatMap((group) => group.actions).find((action) => action.id === "undo")!;
    expect(bold.disabled).toBe(false);
    expect(runToolbarAction(controller, bold, target)).toBe(true);
    expect(runToolbarAction(controller, undo, target)).toBe(true);
    expect(calls).toEqual(["bold", "undo"]);
  });

  it("projects every authoring chrome surface from canonical state", () => {
    const controller = createEditor({ markdown: "# Outline\n", projector: createMarkdownProjector() });
    const model = createAuthoringModel(controller, { slashQuery: "table", compact: true });
    expect(model.outline).toEqual([expect.objectContaining({ level: 1, text: "Outline" })]);
    expect(model.slashCommands.map((entry) => entry.id)).toEqual(["table"]);
    expect(model.compact).toBe(true);
    expect(filterSlashCommands("upload")[0]?.kind).toBe("file");
  });

  it("shows contextual controls only for the matching canonical selection", () => {
    const range = createEditor({ markdown: "text", projector: createMarkdownProjector(), selection: { kind: "text", anchor: 0, head: 4 } });
    expect(createAuthoringModel(range)).toMatchObject({ bubbleVisible: true, floatingVisible: false, slashOpen: false });
    const caret = createEditor({ markdown: "/tab", projector: createMarkdownProjector(), selection: { kind: "text", anchor: 4, head: 4 } });
    const model = createAuthoringModel(caret);
    expect(model).toMatchObject({ bubbleVisible: false, floatingVisible: true, slashOpen: true });
    expect(model.slashCommands.map((entry) => entry.id)).toEqual(["table"]);
  });

  it("inserts Markdown at the canonical selection when no visual surface accepts it", () => {
    const controller = createEditor({
      markdown: "before after",
      projector: createMarkdownProjector(),
      selection: { kind: "text", anchor: 7, head: 12 },
    });
    insertMarkdownAtSelection(controller, { insertMarkdown: () => false }, "asset");
    expect(controller.getState()).toMatchObject({
      markdown: "before asset",
      selection: { kind: "text", anchor: 12, head: 12 },
    });
  });
});
