import * as React from 'react';
import { renderPresetFixture } from '@uifn/react/fixture';
import { createRoot, type Root } from 'react-dom/client';
import '@uifn/components/styles.css';
import { ButtonRoot } from '@uifn/components-react/button';
import { CardRoot, CardHeader, CardTitle, CardContent } from '@uifn/components-react/card';
import { FieldRoot, FieldLabel } from '@uifn/components-react/field';
import { SelectRoot, SelectLabel, SelectTrigger, SelectValueText, SelectContent, SelectItem } from '@uifn/components-react/select';
import { InputRoot } from '@uifn/components-react/input';
import { CheckboxRoot, CheckboxControl, CheckboxLabel } from '@uifn/components-react/checkbox';
import { SwitchRoot, SwitchControl, SwitchThumb, SwitchLabel } from '@uifn/components-react/switch';
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from '@uifn/components-react/tabs';
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from '@uifn/components-react/menu';
import { DialogPortal, DialogRoot, DialogTrigger, DialogContent, DialogTitle, DialogClose } from '@uifn/components-react/dialog';
import { TableRoot, TableTable, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@uifn/components-react/table';
import {
  PRESET_AXES,
  PRESET_AXIS_LABELS,
  PRESET_FIELD_ORDER,
  compilePreset,
  encodePreset,
  fixtureCss,
  presetFixtureTree,
  PRESET_FIXTURE_COMPONENTS,
  normalizePreset,
  presetFromUrl,
  PRESET_DEFAULTS,
  randomPreset,
  themeTokenDocument,
  type PresetAxis,
  type UIFnPresetV1,
} from '@uifn/registry/preset';

const components: Record<keyof typeof PRESET_FIXTURE_COMPONENTS, React.ElementType> = { ButtonRoot, CardRoot, CardHeader, CardTitle, CardContent, FieldRoot, FieldLabel, SelectRoot, SelectLabel, SelectTrigger, SelectValueText, SelectContent, SelectItem, InputRoot, CheckboxRoot, CheckboxControl, CheckboxLabel, SwitchRoot, SwitchControl, SwitchThumb, SwitchLabel, TabsRoot, TabsList, TabsTrigger, TabsContent, MenuRoot, MenuTrigger, MenuContent, MenuItem, DialogRoot, DialogPortal, DialogTrigger, DialogContent, DialogTitle, DialogClose, TableRoot, TableTable, TableHeader, TableBody, TableRow, TableHead, TableCell };
let preview: Root | undefined;

const VIEWPORTS = {
  desktop: 1120,
  tablet: 768,
  mobile: 390,
} as const;


function optionControl(axis: PresetAxis, preset: UIFnPresetV1, locked: Set<PresetAxis>): string {
  const options = (PRESET_AXES[axis] as readonly string[]).map((value) => `<option value="${value}" ${preset[axis] === value ? 'selected' : ''}>${value}</option>`).join('');
  return `<div class="axis">
    <span>
      <input type="checkbox" data-lock="${axis}" aria-label="Lock ${PRESET_AXIS_LABELS[axis]}" ${locked.has(axis) ? 'checked' : ''} />
      <label for="preset-${axis}">${PRESET_AXIS_LABELS[axis]}</label>
    </span>
    <select id="preset-${axis}" data-axis="${axis}">${options}</select>
  </div>`;
}

function render(preset: UIFnPresetV1, locked: Set<PresetAxis>, mode: 'light' | 'dark', viewport: keyof typeof VIEWPORTS) {
  const plan = compilePreset(preset);
  const tokens = themeTokenDocument(preset);
  const app = document.querySelector('#app');
  if (!app) return;
  ensureShell(app, preset, locked, mode, viewport);
  syncControls(app, preset, locked, mode, viewport);
  syncOutputs(app, plan, tokens);
  updatePreview(app, plan, mode, viewport);
}

function ensureShell(app: Element, preset: UIFnPresetV1, locked: Set<PresetAxis>, mode: 'light' | 'dark', viewport: keyof typeof VIEWPORTS) {
  if (!app.querySelector('.preview-root')) {
    preview?.unmount();
    preview = undefined;
    app.innerHTML = `
    <header class="shell-header">
      <div>
        <p class="kicker">uifn Create</p>
        <h1>Versioned presets</h1>
      </div>
      <div class="header-actions">
        <button type="button" data-action="random">Randomize unlocked</button>
        <button type="button" data-action="copy-code">Copy code</button>
        <button type="button" data-action="copy-url">Copy URL</button>
      </div>
    </header>
    <main class="layout">
      <form class="controls" aria-label="Preset axes">
        ${PRESET_FIELD_ORDER.map((axis: PresetAxis) => optionControl(axis, preset, locked)).join('')}
      </form>
      <section class="preview-pane">
        <div class="preview-toolbar">
          <div class="segmented" role="group" aria-label="Color mode">
            <button type="button" data-mode="light" ${mode === 'light' ? 'aria-pressed="true"' : 'aria-pressed="false"'}>Light</button>
            <button type="button" data-mode="dark" ${mode === 'dark' ? 'aria-pressed="true"' : 'aria-pressed="false"'}>Dark</button>
          </div>
          <div class="segmented" role="group" aria-label="Viewport">
            ${Object.keys(VIEWPORTS).map((name) => `<button type="button" data-viewport="${name}" ${viewport === name ? 'aria-pressed="true"' : 'aria-pressed="false"'}>${name}</button>`).join('')}
          </div>
        </div>
        <div class="preview-frame">
          <style data-preset-theme></style>
          <style data-preset-fonts></style>
          <div class="preview-root"></div>
        </div>
        <section class="outputs">
          <article>
            <h2>New project</h2>
            <pre data-command="init"><code data-output="init"></code></pre>
            <p data-unavailable="init">Project creation is currently available for React presets.</p>
          </article>
          <article>
            <h2>Existing project</h2>
            <pre data-command="apply"><code data-output="apply"></code></pre>
            <p data-unavailable="apply">Full project application is currently available for React presets.</p>
            <div data-command="applyTheme"><p>Apply theme only</p>
            <pre><code data-output="applyTheme"></code></pre></div>
            <div data-command="applyFont"><p>Apply fonts only</p>
            <pre><code data-output="applyFont"></code></pre></div>
          </article>
          <article>
            <h2>Preset code</h2>
            <pre><code data-output="code"></code></pre>
            <p><a data-output="url"></a></p>
          </article>
          <article>
            <h2>Theme tokens</h2>
            <pre><code data-output="tokens"></code></pre>
          </article>
        </section>
      </section>
    </main>
  `;
  }
}

function syncControls(app: Element, preset: UIFnPresetV1, locked: Set<PresetAxis>, mode: 'light' | 'dark', viewport: keyof typeof VIEWPORTS) {
  for (const axis of PRESET_FIELD_ORDER) {
    const select = app.querySelector<HTMLSelectElement>(`select[data-axis="${axis}"]`);
    if (select) select.value = preset[axis];
    const checkbox = app.querySelector<HTMLInputElement>(`input[data-lock="${axis}"]`);
    if (checkbox) checkbox.checked = locked.has(axis);
  }
  for (const button of app.querySelectorAll<HTMLButtonElement>('button[data-mode], button[data-viewport]')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode || button.dataset.viewport === viewport));
  }
}

function syncOutputs(app: Element, plan: ReturnType<typeof compilePreset>, tokens: ReturnType<typeof themeTokenDocument>) {
  for (const command of ['init', 'apply', 'applyTheme', 'applyFont'] as const) {
    app.querySelector<HTMLElement>(`[data-command="${command}"]`)!.hidden = !plan.commands[command];
    const unavailable = app.querySelector<HTMLElement>(`[data-unavailable="${command}"]`);
    if (unavailable) unavailable.hidden = Boolean(plan.commands[command]);
  }
  for (const [name, value] of Object.entries({ ...plan.commands, code: plan.code, url: plan.url, tokens: JSON.stringify(tokens, null, 2) })) {
    const output = app.querySelector(`[data-output="${name}"]`);
    if (output) output.textContent = value ?? '';
  }
  const link = app.querySelector<HTMLAnchorElement>('[data-output="url"]');
  if (link) link.href = plan.url;
}

function updatePreview(app: Element, plan: ReturnType<typeof compilePreset>, mode: 'light' | 'dark', viewport: keyof typeof VIEWPORTS) {
  const frame = app.querySelector<HTMLElement>('.preview-frame');
  if (frame) {
    frame.dataset.mode = mode;
    frame.style.width = `${VIEWPORTS[viewport]}px`;
  }
  const fonts = app.querySelector('[data-preset-fonts]');
  if (fonts && fonts.textContent !== plan.css.fonts) fonts.textContent = plan.css.fonts;
  const style = app.querySelector('[data-preset-theme]');
  const css = plan.css.light + plan.css.dark + fixtureCss();
  if (style && style.textContent !== css) style.textContent = css;
  const previewRoot = app.querySelector('.preview-root') as HTMLElement | null;
  if (previewRoot) {
    previewRoot.dataset.uifnMode = mode;
    preview ??= createRoot(previewRoot);
    preview.render(renderPresetFixture(presetFixtureTree(plan), components, previewRoot));
    const vars = mode === 'dark' ? plan.theme.darkVars : plan.theme.lightVars;
    Object.entries(vars).forEach(([name, value]) => previewRoot.style.setProperty(name, String(value)));
    previewRoot.style.background = vars['--uifn-color-surface-canvas'];
    previewRoot.style.color = vars['--uifn-color-text-primary'];
    previewRoot.style.fontFamily = vars['--uifn-typography-family-sans'];
  }
}

function syncUrl(preset: UIFnPresetV1) {
  const url = new URL(window.location.href);
  url.searchParams.set('preset', encodePreset(preset));
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

function boot() {
  let preset: UIFnPresetV1;
  try {
    const url = new URL(window.location.href);
    const hasPreset = url.searchParams.has('preset') || url.searchParams.has('p') || url.hash.startsWith('#preset=');
    preset = hasPreset ? presetFromUrl(url.href) : { ...PRESET_DEFAULTS };
  } catch (error) {
    const app = document.querySelector('#app');
    if (app) {
      app.setAttribute('role', 'alert');
      app.textContent = `Unable to load this preset. ${error instanceof Error ? error.message : 'Invalid preset URL.'} Remove the preset from the URL to start a new configuration.`;
    }
    return;
  }
  const locked = new Set<PresetAxis>(['framework', 'installMode']);
  let mode: 'light' | 'dark' = 'light';
  let viewport: keyof typeof VIEWPORTS = 'desktop';
  const paint = () => {
    syncUrl(preset);
    render(preset, locked, mode, viewport);
  };
  paint();
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) return;
    const axis = target.dataset.axis as PresetAxis | undefined;
    const lock = target.dataset.lock as PresetAxis | undefined;
    if (axis && target instanceof HTMLSelectElement) {
      preset = normalizePreset({ ...preset, [axis]: target.value });
      paint();
    }
    if (lock && target instanceof HTMLInputElement) {
      if (target.checked) locked.add(lock);
      else locked.delete(lock);
    }
  });
  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) return;
    const action = target.dataset.action;
    const nextMode = target.dataset.mode;
    const nextViewport = target.dataset.viewport;
    if (nextMode === 'light' || nextMode === 'dark') { mode = nextMode; paint(); }
    if (nextViewport === 'desktop' || nextViewport === 'tablet' || nextViewport === 'mobile') { viewport = nextViewport; paint(); }
    if (action === 'random') { preset = randomPreset({ seed: Date.now(), locks: Object.fromEntries([...locked].map((axis) => [axis, true])), base: preset }); paint(); }
    if (action === 'copy-code') await navigator.clipboard?.writeText(encodePreset(preset));
    if (action === 'copy-url') await navigator.clipboard?.writeText(compilePreset(preset).url);
  });
}

boot();
