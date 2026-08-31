import type { MdfnSelection } from "./types";

export function validateMdfnSelection(selection: MdfnSelection, markdownLength: number): MdfnSelection {
  if (selection?.kind !== "text") return selection;
  if (
    !Number.isInteger(selection.anchor)
    || !Number.isInteger(selection.head)
    || selection.anchor < 0
    || selection.head < 0
    || selection.anchor > markdownLength
    || selection.head > markdownLength
  ) {
    throw new RangeError("MDFN_SELECTION_RANGE_INVALID");
  }
  return selection;
}
