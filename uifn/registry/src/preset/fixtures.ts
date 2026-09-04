import type { PresetCompilePlan } from './compiler';

export function fixtureMarkup(plan: PresetCompilePlan): string {
  const { preset, theme } = plan;
  const chart = theme.chartPalette.map((color, index) => `<span class="uifn-chart-swatch" style="background:${color}" title="series ${index + 1}"></span>`).join('');
  return `<section class="uifn-fixture" data-uifn-style="${preset.style}" data-uifn-density="${preset.density}" data-uifn-menu="${preset.menuTreatment}" data-uifn-radius="${preset.radius}">
  <header class="uifn-fixture-header">
    <p class="uifn-kicker">Public token preview</p>
    <h1>Workspace overview</h1>
    <p>These fixtures are painted only with public <code>--uifn-*</code> variables. Catalog CSS does not own component appearance.</p>
  </header>
  <div class="uifn-fixture-grid">
    <article class="uifn-card">
      <h2>Actions</h2>
      <div class="uifn-row">
        <button class="uifn-button" type="button">Continue</button>
        <button class="uifn-button uifn-button--secondary" type="button">Secondary</button>
        <button class="uifn-button uifn-button--ghost" type="button">Ghost</button>
        <button class="uifn-button uifn-button--danger" type="button">Delete</button>
      </div>
    </article>
    <article class="uifn-card">
      <h2>Field</h2>
      <label class="uifn-field">
        <span>Project name</span>
        <input class="uifn-input" value="Northwind" />
      </label>
      <label class="uifn-check">
        <input type="checkbox" checked />
        <span>Send weekly digest</span>
      </label>
      <label class="uifn-switch">
        <input type="checkbox" role="switch" checked />
        <span>Live preview</span>
      </label>
    </article>
    <article class="uifn-card">
      <h2>Navigation</h2>
      <div class="uifn-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true">Overview</button>
        <button type="button" role="tab">Members</button>
        <button type="button" role="tab">Billing</button>
      </div>
      <div class="uifn-menu" data-treatment="${preset.menuTreatment}">
        <button type="button">Open menu</button>
        <div class="uifn-menu-panel">
          <button type="button">Duplicate</button>
          <button type="button">Archive</button>
          <button type="button">Share</button>
        </div>
      </div>
    </article>
    <article class="uifn-card">
      <h2>Table</h2>
      <table class="uifn-table">
        <thead><tr><th>Name</th><th>Status</th><th>Load</th></tr></thead>
        <tbody>
          <tr><td>Ingest</td><td>Ready</td><td>12%</td></tr>
          <tr><td>Compile</td><td>Running</td><td>64%</td></tr>
          <tr><td>Publish</td><td>Queued</td><td>4%</td></tr>
        </tbody>
      </table>
      <div class="uifn-chart" aria-label="Chart palette">${chart}</div>
    </article>
  </div>
</section>`;
}

export function fixtureCss(): string {
  return `.uifn-fixture{font-family:var(--uifn-typography-family-sans);color:var(--uifn-color-text-primary);background:var(--uifn-color-surface-canvas);padding:1.5rem;min-height:100%;}
.uifn-fixture h1,.uifn-fixture h2{font-family:var(--uifn-typography-family-heading);margin:0 0 .5rem;}
.uifn-kicker{color:var(--uifn-color-text-muted);text-transform:uppercase;letter-spacing:.08em;font-size:.75rem;margin:0 0 .35rem;}
.uifn-fixture-grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));}
.uifn-card{background:var(--uifn-color-surface-raised);border:1px solid var(--uifn-color-border-default);border-radius:var(--uifn-radius-lg);padding:1rem;box-shadow:0 8px 24px rgb(15 23 42 / 8%);}
.uifn-row,.uifn-tabs{display:flex;flex-wrap:wrap;gap:.5rem;}
.uifn-button{min-height:var(--uifn-control-size-md);padding:0 1rem;border:0;border-radius:var(--uifn-radius-md);background:var(--uifn-color-accent-solid);color:var(--uifn-color-accent-contrast);font:inherit;cursor:pointer;}
.uifn-button--secondary{background:var(--uifn-color-accent-subtle);color:var(--uifn-color-text-primary);}
.uifn-button--ghost{background:transparent;color:var(--uifn-color-text-primary);border:1px solid var(--uifn-color-border-default);}
.uifn-button--danger{background:var(--uifn-color-danger-solid);color:var(--uifn-color-danger-contrast);}
.uifn-field{display:grid;gap:.35rem;margin:0 0 .75rem;color:var(--uifn-color-text-secondary);}
.uifn-input{min-height:var(--uifn-control-size-md);border:1px solid var(--uifn-color-border-default);border-radius:var(--uifn-radius-md);background:var(--uifn-color-surface-sunken);color:var(--uifn-color-text-primary);padding:0 .75rem;font:inherit;}
.uifn-check,.uifn-switch{display:flex;gap:.5rem;align-items:center;margin:.4rem 0;color:var(--uifn-color-text-secondary);}
.uifn-tabs button{min-height:var(--uifn-control-size-sm);border:0;background:transparent;color:var(--uifn-color-text-secondary);border-bottom:2px solid transparent;font:inherit;}
.uifn-tabs button[aria-selected="true"]{color:var(--uifn-color-text-primary);border-bottom-color:var(--uifn-color-accent-solid);}
.uifn-menu{position:relative;margin-top:.75rem;}
.uifn-menu-panel{margin-top:.5rem;display:grid;background:var(--uifn-color-surface-overlay);border:1px solid var(--uifn-color-border-default);border-radius:var(--uifn-radius-md);overflow:hidden;}
.uifn-menu[data-treatment="inset"] .uifn-menu-panel{background:var(--uifn-color-surface-sunken);}
.uifn-menu[data-treatment="bordered"] .uifn-menu-panel{border-width:2px;border-color:var(--uifn-color-border-strong);}
.uifn-menu[data-treatment="elevated"] .uifn-menu-panel{box-shadow:0 18px 48px rgb(15 23 42 / 16%);}
.uifn-menu-panel button{border:0;background:transparent;color:inherit;text-align:left;padding:.65rem .85rem;font:inherit;}
.uifn-table{width:100%;border-collapse:collapse;font-size:.9rem;}
.uifn-table th,.uifn-table td{border-bottom:1px solid var(--uifn-color-border-subtle);padding:.45rem 0;text-align:left;}
.uifn-chart{display:flex;gap:.4rem;margin-top:.75rem;}
.uifn-chart-swatch{flex:1;height:2rem;border-radius:var(--uifn-radius-sm);}
@media (prefers-reduced-motion: reduce){.uifn-button,.uifn-input,.uifn-menu-panel{transition:none;}}`;
}
