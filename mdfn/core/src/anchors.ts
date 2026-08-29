import type { ChangedRange, MdfnSelection, MdfnSidecar, SidecarAnchor, TextSelection } from "./types";

function mapPosition(position: number, range: ChangedRange, affinity: "before" | "after"): number {
  const removed = range.to - range.from;
  const delta = range.insertedLength - removed;
  if (position < range.from || (position === range.from && affinity === "before")) return position;
  if (position > range.to || (position === range.to && affinity === "after")) return position + delta;
  return affinity === "before" ? range.from : range.from + range.insertedLength;
}

function mapTextSelection(selection: TextSelection, range: ChangedRange): TextSelection {
  const collapsed = selection.anchor === selection.head;
  const forward = selection.anchor <= selection.head;
  const anchorAffinity = collapsed || !forward ? "after" : "before";
  const headAffinity = collapsed || forward ? "after" : "before";
  const anchor = mapPosition(selection.anchor, range, anchorAffinity);
  const head = mapPosition(selection.head, range, headAffinity);
  return anchor === selection.anchor && head === selection.head ? selection : { ...selection, anchor, head };
}

/**
 * Map the canonical editor selection through source changes. Node selections are
 * cleared because arbitrary source edits can invalidate their stable node id.
 */
export function mapSelection(selection: MdfnSelection, ranges: readonly ChangedRange[]): MdfnSelection {
  if (!selection || ranges.length === 0) return selection;
  if (selection.kind === "node") return null;
  return ranges.reduce<TextSelection>((current, range) => mapTextSelection(current, range), selection);
}

export function mapAnchor(anchor: SidecarAnchor, ranges: readonly ChangedRange[]): SidecarAnchor {
  return ranges.reduce<SidecarAnchor>((current, range) => {
    const affinity = current.affinity ?? "after";
    const from = mapPosition(current.from, range, affinity === "before" ? "before" : "after");
    const to = mapPosition(current.to, range, affinity === "after" ? "after" : "before");
    return { ...current, from: Math.min(from, to), to: Math.max(from, to) };
  }, anchor);
}

export function mapSidecar(sidecar: MdfnSidecar | undefined, ranges: readonly ChangedRange[]): MdfnSidecar | undefined {
  if (!sidecar || ranges.length === 0) return sidecar;
  return {
    ...sidecar,
    comments: sidecar.comments?.map((thread) => ({ ...thread, anchor: mapAnchor(thread.anchor, ranges) })),
    suggestions: sidecar.suggestions?.map((suggestion) => ({ ...suggestion, anchor: mapAnchor(suggestion.anchor, ranges) })),
  };
}
