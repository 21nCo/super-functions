import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import '@uifn/components/styles.css';
import { ButtonRoot } from '@uifn/components-react/button';
import { CardRoot } from '@uifn/components-react/card';
import { CardHeader } from '@uifn/components-react/card';
import { CardTitle } from '@uifn/components-react/card';
import { CardContent } from '@uifn/components-react/card';
import { FieldRoot } from '@uifn/components-react/field';
import { FieldLabel } from '@uifn/components-react/field';
import { SelectRoot } from '@uifn/components-react/select';
import { SelectLabel } from '@uifn/components-react/select';
import { SelectTrigger } from '@uifn/components-react/select';
import { SelectValueText } from '@uifn/components-react/select';
import { SelectContent } from '@uifn/components-react/select';
import { SelectItem } from '@uifn/components-react/select';
import { InputRoot } from '@uifn/components-react/input';
import { CheckboxRoot } from '@uifn/components-react/checkbox';
import { CheckboxControl } from '@uifn/components-react/checkbox';
import { CheckboxLabel } from '@uifn/components-react/checkbox';
import { SwitchRoot } from '@uifn/components-react/switch';
import { SwitchControl } from '@uifn/components-react/switch';
import { SwitchThumb } from '@uifn/components-react/switch';
import { SwitchLabel } from '@uifn/components-react/switch';
import { TabsRoot } from '@uifn/components-react/tabs';
import { TabsList } from '@uifn/components-react/tabs';
import { TabsTrigger } from '@uifn/components-react/tabs';
import { TabsContent } from '@uifn/components-react/tabs';
import { MenuRoot } from '@uifn/components-react/menu';
import { MenuTrigger } from '@uifn/components-react/menu';
import { MenuContent } from '@uifn/components-react/menu';
import { MenuItem } from '@uifn/components-react/menu';
import { DialogPortal } from '@uifn/components-react/dialog';
import { DialogRoot } from '@uifn/components-react/dialog';
import { DialogTrigger } from '@uifn/components-react/dialog';
import { DialogContent } from '@uifn/components-react/dialog';
import { DialogTitle } from '@uifn/components-react/dialog';
import { DialogClose } from '@uifn/components-react/dialog';
import { TableRoot } from '@uifn/components-react/table';
import { TableTable } from '@uifn/components-react/table';
import { TableHeader } from '@uifn/components-react/table';
import { TableBody } from '@uifn/components-react/table';
import { TableRow } from '@uifn/components-react/table';
import { TableHead } from '@uifn/components-react/table';
import { TableCell } from '@uifn/components-react/table';
import {
  PRESET_AXES,
  PRESET_AXIS_LABELS,
  PRESET_DEFAULTS,
  PRESET_FIELD_ORDER,
  compilePreset,
  encodePreset,
  fixtureCss,
  presetFixtureTree,
  type PresetFixtureNode,
  normalizePreset,
  presetFromUrl,
  randomPreset,
  themeTokenDocument,
  type PresetAxis,
  type UIFnPresetV1,
} from '@uifn/registry/preset';

const components: Record<string, React.ElementType> = { ButtonRoot, CardRoot, CardHeader, CardTitle, CardContent, FieldRoot, FieldLabel, SelectRoot, SelectLabel, SelectTrigger, SelectValueText, SelectContent, SelectItem, InputRoot, CheckboxRoot, CheckboxControl, CheckboxLabel, SwitchRoot, SwitchControl, SwitchThumb, SwitchLabel, TabsRoot, TabsList, TabsTrigger, TabsContent, MenuRoot, MenuTrigger, MenuContent, MenuItem, DialogRoot, DialogPortal, DialogTrigger, DialogContent, DialogTitle, DialogClose, TableRoot, TableTable, TableHeader, TableBody, TableRow, TableHead, TableCell };
let preview: Root | undefined;
export function renderFixture(node: PresetFixtureNode | string, key: number): React.ReactNode {
  if (typeof node === 'string') return node;
  return React.createElement(components[node.type] ?? node.type, { ...node.props, key, ...(['SelectContent', 'MenuContent', 'DialogPortal'].includes(node.type) ? { container: document.querySelector('.preview-root') } : {}) }, ...(node.children ?? []).map(renderFixture));
}

const VIEWPORTS = {
  desktop: 1120,
  tablet: 768,
  mobile: 390,
} as const;

function parseState(): UIFnPresetV1 {
  try {
    return presetFromUrl(window.location.href);
  } catch {
    return { ...PRESET_DEFAULTS };
  }
}

function optionControl(axis: PresetAxis, preset: UIFnPresetV1, locked: Set<PresetAxis>): string {
  const options = (PRESET_AXES[axis] as readonly string[]).map((value) => `<option value="${value}" ${preset[axis] === value ? 'selected' : ''}>${value}</option>`).join('');
  return `<label class="axis">
    <span>
      <input type="checkbox" data-lock="${axis}" ${locked.has(axis) ? 'checked' : ''} />
      ${PRESET_AXIS_LABELS[axis]}
    </span>
    <select data-axis="${axis}">${options}</select>
  </label>`;
}

function render(preset: UIFnPresetV1, locked: Set<PresetAxis>, mode: 'light' | 'dark', viewport: keyof typeof VIEWPORTS) {
  const plan = compilePreset(preset);
  const tokens = themeTokenDocument(preset);
  const app = document.querySelector('#app');
  if (!app) return;
  preview?.unmount();
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
          <style></style>
          <div class="preview-root"></div>
        </div>
        <section class="outputs">
          <article>
            <h2>New project</h2>
            ${plan.commands.init ? '<pre><code data-output="init"></code></pre>' : "<p>Project creation is currently available for React presets.</p>"}
          </article>
          <article>
            <h2>Existing project</h2>
            ${plan.commands.apply ? '<pre><code data-output="apply"></code></pre>' : "<p>Full project application is currently available for React presets.</p>"}
            <pre><code data-output="applyTheme"></code></pre>
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
  for (const [name, value] of Object.entries({ ...plan.commands, code: plan.code, url: plan.url, tokens: JSON.stringify(tokens, null, 2) })) {
    const output = app.querySelector(`[data-output="${name}"]`);
    if (output) output.textContent = value ?? '';
  }
  const link = app.querySelector<HTMLAnchorElement>('[data-output="url"]');
  if (link) link.href = plan.url;
  const frame = app.querySelector<HTMLElement>('.preview-frame');
  if (frame) {
    frame.dataset.mode = mode;
    frame.style.width = `${VIEWPORTS[viewport]}px`;
  }
  const style = app.querySelector('style');
  if (style) style.textContent = plan.css.fonts + plan.css.light + plan.css.dark + fixtureCss();
  const previewRoot = app.querySelector('.preview-root') as HTMLElement | null;
  if (previewRoot) {
    previewRoot.dataset.uifnMode = mode;
    preview = createRoot(previewRoot);
    preview.render(renderFixture(presetFixtureTree(plan), 0));
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
  let preset = parseState();
  const locked = new Set<PresetAxis>(['framework', 'installMode']);
  let mode: 'light' | 'dark' = 'light';
  let viewport: keyof typeof VIEWPORTS = 'desktop';
  const paint = () => {
    syncUrl(preset);
    render(preset, locked, mode, viewport);
  };
  paint();
  document.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    const axis = target.getAttribute('data-axis') as PresetAxis | null;
    const lock = target.getAttribute('data-lock') as PresetAxis | null;
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
    const target = event.target as HTMLElement;
    const action = target.getAttribute('data-action');
    const nextMode = target.getAttribute('data-mode');
    const nextViewport = target.getAttribute('data-viewport');
    if (nextMode === 'light' || nextMode === 'dark') { mode = nextMode; paint(); }
    if (nextViewport === 'desktop' || nextViewport === 'tablet' || nextViewport === 'mobile') { viewport = nextViewport; paint(); }
    if (action === 'random') { preset = randomPreset({ seed: Date.now(), locks: Object.fromEntries([...locked].map((axis) => [axis, true])), base: preset }); paint(); }
    if (action === 'copy-code') await navigator.clipboard?.writeText(encodePreset(preset));
    if (action === 'copy-url') await navigator.clipboard?.writeText(compilePreset(preset).url);
  });
}

boot();
