<!-- ResponseDiff.svelte — side-by-side response comparison (UI-S-006) -->
<script lang="ts">
  export interface TryItResponse {
    statusCode: number; statusText: string;
    headers: Record<string, string>; body: unknown; durationMs: number;
  }
  export let left: TryItResponse;
  export let right: TryItResponse;
  export let leftLabel: string = "Before";
  export let rightLabel: string = "After";

  function bodyStr(b: unknown): string {
    return typeof b === "string" ? b : JSON.stringify(b, null, 2);
  }

  function diffLines(a: string, b: string): { left: { kind: string; text: string }[]; right: { kind: string; text: string }[] } {
    const al = a.split("\n");
    const bl = b.split("\n");
    const leftDiff: { kind: string; text: string }[] = [];
    const rightDiff: { kind: string; text: string }[] = [];
    const max = Math.max(al.length, bl.length);
    for (let i = 0; i < max; i++) {
      const a = al[i] ?? "";
      const b = bl[i] ?? "";
      if (a === b) { leftDiff.push({ kind: "same", text: a }); rightDiff.push({ kind: "same", text: b }); }
      else { leftDiff.push({ kind: "removed", text: a }); rightDiff.push({ kind: "added", text: b }); }
    }
    return { left: leftDiff, right: rightDiff };
  }

  $: diff = diffLines(bodyStr(left.body), bodyStr(right.body));

  function statusColor(code: number): string {
    if (code >= 200 && code < 300) return "var(--apifn-green)";
    if (code >= 400) return "var(--apifn-red)";
    return "var(--apifn-yellow)";
  }

  function lineStyle(kind: string): string {
    if (kind === "added") return "background:#065f4615;color:var(--apifn-green)";
    if (kind === "removed") return "background:#7f1d1d15;color:var(--apifn-red)";
    return "";
  }
</script>

<div class="container">
  <div class="header">
    <div class="col-header">{leftLabel}</div>
    <div class="divider"></div>
    <div class="col-header">{rightLabel}</div>
  </div>

  <!-- Summary -->
  <div class="summary">
    <span>
      Status:
      <span style="color:{statusColor(left.statusCode)};font-weight:700">{left.statusCode}</span>
      →
      <span style="color:{statusColor(right.statusCode)};font-weight:700">{right.statusCode}</span>
    </span>
    <span>
      Duration:
      <span class="mono">{left.durationMs}ms</span>
      →
      <span class="mono" style="color:{right.durationMs > left.durationMs ? 'var(--apifn-red)' : 'var(--apifn-green)'}">{right.durationMs}ms</span>
    </span>
  </div>

  <!-- Side-by-side diff -->
  <div class="cols">
    <div class="col">
      <pre>{#each diff.left as line}<span style={lineStyle(line.kind)}>{line.text + "\n"}</span>{/each}</pre>
    </div>
    <div class="separator"></div>
    <div class="col">
      <pre>{#each diff.right as line}<span style={lineStyle(line.kind)}>{line.text + "\n"}</span>{/each}</pre>
    </div>
  </div>
</div>

<style>
  .container { font-family: var(--apifn-font-sans); color: var(--apifn-text); }
  .header { display: flex; border-bottom: 1px solid var(--apifn-border); }
  .col-header { flex: 1; padding: 10px 16px; font-weight: 700; font-size: 13px; color: var(--apifn-text-muted); }
  .divider, .separator { width: 1px; background: var(--apifn-border); }
  .summary { display: flex; gap: 24px; padding: 12px 16px; background: var(--apifn-bg-surface); border-bottom: 1px solid var(--apifn-border); font-size: 13px; }
  .mono { font-family: var(--apifn-font-mono); }
  .cols { display: flex; gap: 0; background: var(--apifn-border); }
  .col { flex: 1; background: var(--apifn-bg); padding: 16px; overflow: auto; max-height: 400px; }
  pre { font-family: var(--apifn-font-mono); font-size: 12px; white-space: pre-wrap; word-break: break-all; color: var(--apifn-text); margin: 0; }
  span { display: block; padding: 0 2px; }
</style>
