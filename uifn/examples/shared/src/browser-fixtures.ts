import type { WorkbenchRoute } from './routes.js';
import { activateCatalogUi } from './catalog-presentation.js';

export interface WorkbenchRouteActivationOptions {
  framework: string;
}

const OVERLAY_CONTENT_SELECTOR = [
  "[data-uifn-part='content']",
  "[data-uifn-part='listbox']",
  "[data-uifn-part='menu']",
  "[data-uifn-combobox-content]",
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='menu']",
  "[role='listbox']",
  "[role='tooltip']",
].join(', ');

const OVERLAY_TRIGGER_SELECTOR = [
  "[data-uifn-part='trigger']",
  "[role='combobox']",
  "input[role='combobox']",
  'button',
].join(', ');

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function componentRoot(box: HTMLElement): HTMLElement | null {
  return box.querySelector<HTMLElement>('[data-uifn-component]');
}

function ensureEditableControl(box: HTMLElement, root: HTMLElement, slug: string, formId: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const editableSelector = [
    'input:not([hidden]):not([type="hidden"]):not([aria-hidden="true"]):not([tabindex="-1"])',
    'textarea:not([hidden]):not([aria-hidden="true"]):not([tabindex="-1"])',
    'select:not([hidden]):not([aria-hidden="true"]):not([tabindex="-1"])',
  ].join(', ');
  let control = root.matches(editableSelector)
    ? root as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    : root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(editableSelector);
  if (control) return control;

  if (slug === 'textarea') {
    control = createElement('textarea');
  } else if (slug === 'select') {
    const select = createElement('select');
    select.append(
      createElement('option', { value: 'alpha' }, 'Alpha'),
      createElement('option', { value: 'beta' }, 'Beta')
    );
    control = select;
  } else {
    const input = createElement('input');
    input.type = slug === 'slider'
      ? 'range'
      : ['checkbox', 'switch'].includes(slug)
        ? 'checkbox'
        : slug === 'radio-group'
          ? 'radio'
          : 'text';
    if (slug === 'input-otp') {
      input.inputMode = 'numeric';
      input.maxLength = 6;
      input.autocomplete = 'one-time-code';
    }
    control = input;
  }

  control.setAttribute('data-uifn-part', 'field');
  control.setAttribute('data-uifn-form-control', 'true');
  control.setAttribute('aria-label', `${slug} Workbench value`);
  control.setAttribute('form', formId);
  // This fallback exists only so the QA harness can exercise native form
  // submission for composites without an editable native control. Keep it in
  // the form contract without presenting a second, misleading control beside
  // the public component demo.
  control.hidden = true;
  control.tabIndex = -1;
  control.setAttribute('aria-hidden', 'true');
  const rootCannotContainInteractiveControl = root.matches(
    'button, a[href], input, textarea, select, [role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="grid"], [role="listbox"], [role="menu"], [role="menubar"], [role="tree"], [role="table"], [role="row"]'
  );
  if (slug === 'select' || ['checkbox', 'radio-group', 'switch'].includes(slug) || rootCannotContainInteractiveControl) {
    control.setAttribute('data-uifn-component-owner', slug);
    box.append(control);
  } else {
    root.append(control);
  }
  return control;
}

function activateFormFixture(box: HTMLElement, root: HTMLElement, slug: string): void {
  if (box.querySelector('[data-uifn-form-harness]')) return;
  const formId = `uifn-form-${slug}-${box.dataset.case ?? 'default'}`;
  const form = createElement('form', { id: formId, 'data-uifn-form-harness': 'true' });
  const submit = createElement('button', { type: 'button', 'data-uifn-action': 'form-submit' }, 'Submit fixture');
  const disable = createElement('button', { type: 'button', 'data-uifn-action': 'form-disable' }, 'Toggle disabled');
  const invalidate = createElement('button', { type: 'button', 'data-uifn-action': 'form-invalid' }, 'Toggle invalid');
  const output = createElement('output', { 'data-uifn-form-result': 'true', 'aria-live': 'polite' }, 'not submitted');
  form.append(submit, disable, invalidate, output);
  box.prepend(form);

  const control = ensureEditableControl(box, root, slug, formId);
  const currentRoot = () => componentRoot(box) ?? root;
  const name = `uifn-${slug}-value`;
  control.name = name;
  control.setAttribute('form', formId);
  if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)) {
    control.value = 'on';
  } else if (!control.value && !['autocomplete', 'combobox', 'command', 'tags-input'].includes(slug)) {
    // Preserve the intentional empty query/placeholder state of editable
    // selection composites. Imperatively seeding those inputs produced
    // framework-dependent screenshots because controlled React inputs restore
    // state while Svelte and Solid retain the raw DOM assignment.
    control.value = slug === 'input-otp' ? '' : 'uifn-demo-value';
  }
  root.setAttribute('data-uifn-form-name', name);
  root.setAttribute(
    'data-uifn-form-control-owned',
    String(root.contains(control) || control.getAttribute('data-uifn-component-owner') === slug)
  );
  root.setAttribute('data-uifn-dom-value', control.value);
  root.setAttribute('data-uifn-callback-value', control.value);
  root.setAttribute('data-uifn-change-count', '0');

  const recordValue = () => {
    const activeRoot = currentRoot();
    const value = control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)
      ? String(control.checked)
      : control.value;
    const nextCount = Number(activeRoot.getAttribute('data-uifn-change-count') ?? 0) + 1;
    activeRoot.setAttribute('data-uifn-form-name', name);
    activeRoot.setAttribute('data-uifn-form-control-owned', 'true');
    activeRoot.setAttribute('data-uifn-dom-value', value);
    activeRoot.setAttribute('data-uifn-callback-value', value);
    activeRoot.setAttribute('data-uifn-change-count', String(nextCount));
  };
  control.addEventListener('input', recordValue);
  control.addEventListener('change', recordValue);

  disable.addEventListener('click', () => {
    const activeRoot = currentRoot();
    const next = !control.disabled;
    control.disabled = next;
    activeRoot.setAttribute('aria-disabled', String(next));
    activeRoot.setAttribute('data-uifn-disabled-value', control.value);
  });
  invalidate.addEventListener('click', () => {
    const activeRoot = currentRoot();
    const next = activeRoot.getAttribute('aria-invalid') !== 'true';
    activeRoot.setAttribute('aria-invalid', String(next));
    control.setAttribute('aria-invalid', String(next));
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const submittedValue = String(data.get(name) ?? '');
    output.textContent = submittedValue;
    output.setAttribute('data-submitted-value', submittedValue);
    const activeRoot = currentRoot();
    activeRoot.setAttribute('data-uifn-submitted-value', submittedValue);
    activeRoot.setAttribute('data-uifn-submit-count', String(Number(activeRoot.getAttribute('data-uifn-submit-count') ?? 0) + 1));
  });
  submit.addEventListener('click', () => {
    form.dispatchEvent(new SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
      submitter: submit,
    }));
  });
}

function activateDataTable(box: HTMLElement, root: HTMLElement): void {
  if (box.querySelector('[data-uifn-data-controls]')) return;
  const controls = createElement('div', { 'data-uifn-data-controls': 'data-table' });
  const filter = createElement('input', {
    type: 'search',
    'aria-label': 'Filter data table',
    'data-uifn-action': 'data-filter',
  });
  const sort = createElement('button', { type: 'button', 'data-uifn-action': 'data-sort' }, 'Sort score descending');
  const page = createElement('button', { type: 'button', 'data-uifn-action': 'data-next-page' }, 'Next page');
  const column = createElement('button', { type: 'button', 'data-uifn-action': 'data-toggle-column' }, 'Toggle score column');
  const output = createElement('output', { 'data-uifn-data-result': 'true', 'aria-live': 'polite' }, 'ready');
  controls.append(filter, sort, page, column, output);
  box.prepend(controls);

  const rows = () => Array.from(root.querySelectorAll<HTMLTableRowElement>('tbody [data-row-id]'));
  for (const row of rows()) {
    row.tabIndex = 0;
    const toggleSelection = () => {
      const selected = row.getAttribute('data-selected') !== 'true';
      for (const candidate of rows()) candidate.removeAttribute('data-selected');
      if (selected) row.setAttribute('data-selected', 'true');
      root.setAttribute('data-selected-row', selected ? row.dataset.rowId ?? '' : '');
      output.textContent = selected ? `selected ${row.dataset.rowId}` : 'selection cleared';
    };
    row.addEventListener('click', toggleSelection);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggleSelection();
    });
  }
  filter.addEventListener('input', () => {
    const query = filter.value.toLowerCase();
    let visible = 0;
    for (const row of rows()) {
      const match = row.textContent?.toLowerCase().includes(query) ?? false;
      row.hidden = !match;
      if (match) visible += 1;
    }
    root.setAttribute('data-filtered-rows', String(visible));
    output.textContent = `filtered ${visible}`;
  });
  sort.addEventListener('click', () => {
    const body = root.querySelector('tbody');
    if (!body) return;
    const sorted = rows().sort((left, right) => {
      const leftScore = Number(left.lastElementChild?.textContent ?? 0);
      const rightScore = Number(right.lastElementChild?.textContent ?? 0);
      return rightScore - leftScore;
    });
    body.append(...sorted);
    root.querySelector('[data-column-id="score"]')?.setAttribute('aria-sort', 'descending');
    root.setAttribute('data-sort', 'score-desc');
    output.textContent = 'sorted score desc';
  });
  page.addEventListener('click', () => {
    root.setAttribute('data-page', String(Number(root.getAttribute('data-page') ?? 0) + 1));
    output.textContent = `page ${root.getAttribute('data-page')}`;
  });
  column.addEventListener('click', () => {
    const currentlyHidden = root.getAttribute('data-score-column-hidden') === 'true';
    for (const row of Array.from(root.querySelectorAll('tr'))) {
      const cell = row.children.item(1) as HTMLElement | null;
      if (cell) cell.hidden = !currentlyHidden;
    }
    root.setAttribute('data-score-column-hidden', String(!currentlyHidden));
    output.textContent = currentlyHidden ? 'score column shown' : 'score column hidden';
  });
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function activateCalendar(root: HTMLElement): void {
  if (root.dataset.uifnCalendarActive === 'true') return;
  root.dataset.uifnCalendarActive = 'true';
  const initialDate = root.getAttribute('data-focused-date') ?? root.getAttribute('data-value') ?? '2026-06-10';
  root.setAttribute('data-focused-date', initialDate);
  if (!root.hasAttribute('data-locale')) root.setAttribute('data-locale', 'en-US');
  if (!root.hasAttribute('data-time-zone')) root.setAttribute('data-time-zone', 'UTC');
  if (root.getAttribute('role') === 'grid' && !root.querySelector('[role="gridcell"]')) {
    const row = createElement('div', { role: 'row' });
    row.append(createElement('button', {
      type: 'button',
      role: 'gridcell',
      'aria-label': root.getAttribute('data-focused-date') ?? '2026-06-10',
      'aria-selected': 'false',
    }, root.getAttribute('data-focused-date') ?? '2026-06-10'));
    root.append(row);
  }
  const calendarScope = () => {
    const controlledId = root.querySelector<HTMLElement>('[aria-controls]')?.getAttribute('aria-controls');
    return controlledId ? document.getElementById(controlledId) ?? root : root;
  };
  const cellForDate = (value: string) =>
    calendarScope().querySelector<HTMLElement>(`[role="gridcell"][data-date="${value}"]`) ??
    Array.from(calendarScope().querySelectorAll<HTMLElement>('[role="gridcell"]')).find((cell) =>
      cell.getAttribute('aria-disabled') !== 'true' &&
      (!(cell instanceof HTMLButtonElement) || !cell.disabled)
    );
  const markFocusedCell = (value: string) => {
    for (const cell of Array.from(calendarScope().querySelectorAll<HTMLElement>('[role="gridcell"]'))) {
      if (cell.getAttribute('data-date') === value) {
        cell.setAttribute('data-focused', 'true');
      } else {
        cell.removeAttribute('data-focused');
      }
    }
  };
  markFocusedCell(initialDate);
  root.tabIndex = root.tabIndex >= 0 ? root.tabIndex : 0;
  root.addEventListener('keydown', (event) => {
    const movement: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
    if (event.key in movement) {
      event.preventDefault();
      const current = root.getAttribute('data-focused-date') ?? '2026-06-10';
      const next = addDays(current, movement[event.key]);
      const min = root.getAttribute('data-min');
      const max = root.getAttribute('data-max');
      if ((!min || next >= min) && (!max || next <= max)) {
        root.setAttribute('data-focused-date', next);
        markFocusedCell(next);
        cellForDate(next)?.focus({ preventScroll: true });
      }
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const value = root.getAttribute('data-focused-date') ?? '';
      const cell = cellForDate(value);
      const disabled = cell?.getAttribute('aria-disabled') === 'true' ||
        (cell instanceof HTMLButtonElement && cell.disabled);
      if (cell && !disabled) {
        root.setAttribute('data-value', value);
        for (const candidate of Array.from(calendarScope().querySelectorAll<HTMLElement>('[role="gridcell"]'))) {
          candidate.setAttribute('aria-selected', String(candidate === cell));
        }
      }
    }
  });
}

function activateCommand(box: HTMLElement, root: HTMLElement): void {
  if (box.querySelector('[data-uifn-data-controls="command"]')) return;
  const controls = createElement('div', { 'data-uifn-data-controls': 'command' });
  const search = createElement('input', {
    type: 'search',
    'aria-label': 'Filter commands',
    'data-uifn-action': 'command-filter',
  });
  const output = createElement('output', { 'data-uifn-data-result': 'true', 'aria-live': 'polite' }, 'ready');
  controls.append(search, output);
  box.prepend(controls);
  const options = () => Array.from(root.querySelectorAll<HTMLElement>('[role="option"]'));
  const optionLabel = (option: HTMLElement | undefined) =>
    option?.getAttribute('aria-label') ?? option?.textContent?.trim() ?? '';
  let highlighted = 0;
  const renderHighlight = () => {
    const enabled = options().filter((option) => !option.hidden && option.getAttribute('aria-disabled') !== 'true');
    highlighted = Math.max(0, Math.min(enabled.length - 1, highlighted));
    for (const option of options()) {
      option.setAttribute('aria-selected', String(option === enabled[highlighted]));
      option.tabIndex = option === enabled[highlighted] ? 0 : -1;
    }
    root.setAttribute('data-highlighted-option', optionLabel(enabled[highlighted]));
  };
  search.addEventListener('input', () => {
    const query = search.value.toLowerCase();
    let visible = 0;
    for (const option of options()) {
      const match = option.textContent?.toLowerCase().includes(query) ?? false;
      option.hidden = !match;
      if (match) visible += 1;
    }
    highlighted = 0;
    renderHighlight();
    root.setAttribute('data-filtered-options', String(visible));
    output.textContent = `filtered ${visible}`;
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlighted += 1;
      renderHighlight();
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlighted -= 1;
      renderHighlight();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      root.setAttribute('data-selected-option', root.getAttribute('data-highlighted-option') ?? '');
      output.textContent = `selected ${root.getAttribute('data-selected-option')}`;
    }
  });
  renderHighlight();
}

function activateResizable(root: HTMLElement): void {
  const handle = root.querySelector<HTMLElement>('[data-uifn-part="handle"], [role="separator"]');
  if (!handle || handle.dataset.uifnResizableActive === 'true') return;
  handle.dataset.uifnResizableActive = 'true';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-label', handle.getAttribute('aria-label') ?? 'Resize panels');
  handle.setAttribute('aria-orientation', handle.getAttribute('aria-orientation') ?? 'horizontal');
  handle.setAttribute('aria-valuemin', handle.getAttribute('aria-valuemin') ?? '20');
  handle.setAttribute('aria-valuemax', handle.getAttribute('aria-valuemax') ?? '80');
  handle.setAttribute('aria-valuenow', handle.getAttribute('aria-valuenow') ?? '50');
  const update = (next: number, source: string) => {
    const min = Number(handle.getAttribute('aria-valuemin') ?? 20);
    const max = Number(handle.getAttribute('aria-valuemax') ?? 80);
    const value = Math.max(min, Math.min(max, next));
    handle.setAttribute('aria-valuenow', String(value));
    root.setAttribute('data-resize-source', source);
    const panels = root.querySelectorAll<HTMLElement>('[data-uifn-part="panel"]');
    if (panels[0]) panels[0].style.flexBasis = `${value}%`;
    if (panels[1]) panels[1].style.flexBasis = `${100 - value}%`;
  };
  handle.addEventListener('keydown', (event) => {
    const current = Number(handle.getAttribute('aria-valuenow') ?? 50);
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      update(current + 5, 'keyboard');
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      update(current - 5, 'keyboard');
    }
    if (event.key === 'Home') update(20, 'keyboard');
    if (event.key === 'End') update(80, 'keyboard');
  });
  handle.addEventListener('pointerdown', (event) => {
    handle.setPointerCapture?.(event.pointerId);
    update(Number(handle.getAttribute('aria-valuenow') ?? 50) + 5, 'pointer');
  });
}

function activateSidebar(box: HTMLElement, root: HTMLElement): void {
  if (box.querySelector('[data-uifn-data-controls="sidebar"]')) return;
  const controls = createElement('div', { 'data-uifn-data-controls': 'sidebar' });
  const toggle = createElement('button', { type: 'button', 'data-uifn-action': 'sidebar-toggle' }, 'Toggle sidebar');
  controls.append(toggle);
  box.prepend(controls);
  const storageKey = 'uifn-workbench-sidebar-collapsed';
  const applyMode = () => root.setAttribute('data-mode', window.innerWidth <= 760 ? 'mobile' : 'desktop');
  const nested = createElement('a', { href: '/settings/members', 'data-sidebar-item': 'members' }, 'Members');
  if (!root.querySelector('[data-sidebar-item="members"]')) root.append(nested);
  const persisted = window.localStorage.getItem(storageKey);
  if (persisted !== null) root.setAttribute('data-collapsed', persisted);
  toggle.addEventListener('click', () => {
    const next = root.getAttribute('data-collapsed') !== 'true';
    root.setAttribute('data-collapsed', String(next));
    window.localStorage.setItem(storageKey, String(next));
  });
  root.addEventListener('focusin', (event) => {
    const target = event.target;
    if (target instanceof HTMLAnchorElement) root.setAttribute('data-focused-path', target.pathname);
  });
  applyMode();
  window.addEventListener('resize', applyMode);
}

function activateDataRichFixture(box: HTMLElement, root: HTMLElement, slug: string): void {
  if (slug === 'data-table') activateDataTable(box, root);
  if (slug === 'calendar' || slug === 'date-picker') activateCalendar(root);
  if (slug === 'command') activateCommand(box, root);
  if (slug === 'resizable') activateResizable(root);
  if (slug === 'sidebar') activateSidebar(box, root);
}

function activateOverlayFixture(
  box: HTMLElement,
  root: HTMLElement,
  fixtureId: string,
  options: { readonly qaStressFixture: boolean },
): void {
  box.setAttribute('data-uifn-collision-case', fixtureId);
  if (fixtureId === 'rtl') box.dir = 'rtl';
  const trigger = root.querySelector<HTMLElement>(OVERLAY_TRIGGER_SELECTOR);
  const associatedId =
    trigger?.getAttribute('aria-controls') ??
    trigger?.getAttribute('aria-describedby');
  const content = associatedId
    ? document.getElementById(associatedId)
    : root.querySelector<HTMLElement>(OVERLAY_CONTENT_SELECTOR);
  if (!trigger || !content) return;
  const contentId = content.id || `uifn-overlay-${root.getAttribute('data-uifn-component')}-${fixtureId}`;
  content.id = contentId;
  if (content.getAttribute('role') === 'tooltip') {
    trigger.setAttribute('aria-describedby', contentId);
    trigger.removeAttribute('aria-controls');
    trigger.removeAttribute('aria-expanded');
  } else {
    trigger.setAttribute('aria-controls', contentId);
    trigger.setAttribute('aria-expanded', String(!content.hidden));
  }
  content.setAttribute('data-uifn-overlay-content', 'true');
  if (options.qaStressFixture) {
    content.style.maxWidth = 'min(320px, calc(100vw - 24px))';
    content.style.width = fixtureId === 'long-content' ? 'min(320px, calc(100vw - 24px))' : '';
    content.style.maxHeight = fixtureId === 'long-content' ? '160px' : 'min(320px, calc(100vh - 24px))';
    content.style.overflow = 'auto';
  }

  if (options.qaStressFixture && fixtureId === 'long-content' && !content.querySelector('[data-uifn-long-content]')) {
    content.append(createElement(
      'p',
      {
        'data-uifn-long-content': 'true',
        style: 'display:block;white-space:normal;overflow-wrap:anywhere',
      },
      Array.from({ length: 20 }, (_, index) => `Long overlay line ${index + 1}`).join(' · ')
    ));
  }
  if (options.qaStressFixture && fixtureId === 'nested-overlay' && !content.querySelector('[data-uifn-nested-overlay]')) {
    const nested = createElement('section', { 'data-uifn-nested-overlay': 'true' });
    const nestedTrigger = createElement('button', { type: 'button', 'aria-expanded': 'true' }, 'Nested action');
    const nestedContent = createElement('div', { role: 'menu', tabindex: '-1' }, 'Nested overlay content');
    nested.append(nestedTrigger, nestedContent);
    content.append(nested);
  }
  if (options.qaStressFixture && (
    ['focus-trap', 'dialog', 'alert-dialog', 'sheet'].includes(fixtureId)
    || ['dialog', 'alert-dialog', 'sheet'].includes(root.getAttribute('data-uifn-component') ?? '')
  )) {
    if (!content.querySelector('[data-uifn-focus-first]')) {
      content.append(
        createElement('button', { type: 'button', 'data-uifn-focus-first': 'true' }, 'First action'),
        createElement('button', { type: 'button', 'data-uifn-focus-last': 'true' }, 'Last action')
      );
    }
  }
  if (fixtureId === 'focus-trap' && !content.hidden) {
    document.body.style.overflow = 'hidden';
    document.body.setAttribute('data-uifn-scroll-locked', 'true');
    const focusables = Array.from(content.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'));
    focusables[0]?.focus({ preventScroll: true });
    if (content.dataset.uifnFocusTrap !== 'true') {
      content.dataset.uifnFocusTrap = 'true';
      content.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab' || focusables.length < 2) return;
        const first = focusables[0];
        const last = focusables.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
    }
  }
  if (root.dataset.uifnOverlayActive !== 'true') {
    root.dataset.uifnOverlayActive = 'true';
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      window.setTimeout(() => {
        const nextContent = root.querySelector<HTMLElement>(OVERLAY_CONTENT_SELECTOR);
        const closed = !nextContent || nextContent.hidden || window.getComputedStyle(nextContent).display === 'none';
        if (closed) {
          document.body.style.overflow = '';
          document.body.removeAttribute('data-uifn-scroll-locked');
          trigger.focus({ preventScroll: true });
        }
      }, 0);
    }, true);
  }
}

function enhanceBox(box: HTMLElement, route: WorkbenchRoute): void {
  const root = componentRoot(box);
  if (!root) return;
  const fixtureId = box.dataset.case ?? route.fixtureId ?? 'default';
  const profile = route.contract?.fixtures.find((fixture) => fixture.id === fixtureId)?.profile ?? route.profile ?? route.contract?.qaProfile;
  root.setAttribute('data-uifn-fixture-id', fixtureId);
  root.setAttribute('data-uifn-fixture-profile', profile ?? 'static');
  if ((route.slug ?? root.dataset.uifnComponent) === 'skeleton' && !root.hasAttribute('role')) {
    root.setAttribute('role', 'status');
  }
  const isUserFacingComponentShowcase =
    route.family === 'component' &&
    Boolean(route.slug) &&
    route.path === `/components/${route.slug}`;
  if (isUserFacingComponentShowcase) return;
  const isQaRoute = route.path === `/components/${route.slug}/qa`
    || route.path.startsWith(`/components/${route.slug}/qa/`);
  if (profile === 'form' && isQaRoute) {
    activateFormFixture(box, root, route.slug ?? root.dataset.uifnComponent ?? 'component');
  }
  if (isQaRoute && (profile === 'data-rich' || route.contract?.qaProfiles?.includes('data-rich'))) {
    activateDataRichFixture(box, root, route.slug ?? root.dataset.uifnComponent ?? 'component');
  }
  if (profile === 'overlay') {
    activateOverlayFixture(box, root, fixtureId, { qaStressFixture: isQaRoute });
  }
}

function activateProductModels(scope: ParentNode): void {
  for (const card of Array.from(scope.querySelectorAll<HTMLElement>('[data-uifn-pattern], [data-uifn-sf]'))) {
    if (card.dataset.uifnProductActive === 'true') continue;
    card.dataset.uifnProductActive = 'true';
    for (const action of Array.from(card.querySelectorAll<HTMLButtonElement>('[data-uifn-callback]'))) {
      action.addEventListener('click', () => {
        const callback = action.dataset.uifnCallback ?? 'inspect';
        card.setAttribute('data-uifn-action-fired', 'true');
        card.setAttribute('data-uifn-last-callback', callback);
        card.setAttribute(
          'data-uifn-callback-invocations',
          String(Number(card.getAttribute('data-uifn-callback-invocations') ?? 0) + 1)
        );
        const output = card.querySelector<HTMLOutputElement>('[data-uifn-action-result]');
        if (output) output.textContent = `callback:${callback}`;
      });
    }
  }
}

function activateScenarios(scope: ParentNode): void {
  for (const scenario of Array.from(scope.querySelectorAll<HTMLElement>('[data-uifn-scenario]'))) {
    if (scenario.dataset.uifnScenarioActive === 'true') continue;
    scenario.dataset.uifnScenarioActive = 'true';
    const action = scenario.querySelector<HTMLButtonElement>('[data-uifn-action="scenario-primary"]');
    const form = action?.closest('form');
    const save = (event: Event) => {
      event.preventDefault();
      scenario.setAttribute('data-uifn-scenario-fired', 'true');
      scenario.setAttribute('data-uifn-workflow-state', 'saved');
      const output = scenario.querySelector<HTMLOutputElement>('[data-uifn-scenario-state]');
      if (output) output.textContent = 'saved';
    };
    if (form) form.addEventListener('submit', save);
    else action?.addEventListener('click', save);
    const filter = scenario.querySelector<HTMLInputElement>('[data-uifn-action="scenario-filter"]');
    filter?.addEventListener('input', () => {
      let visible = 0;
      for (const row of Array.from(scenario.querySelectorAll<HTMLTableRowElement>('tbody tr'))) {
        const match = row.textContent?.toLowerCase().includes(filter.value.toLowerCase()) ?? false;
        row.hidden = !match;
        if (match) visible += 1;
      }
      scenario.setAttribute('data-uifn-filtered-rows', String(visible));
    });
  }
}

export function activateWorkbenchRoute(
  scope: ParentNode,
  route: WorkbenchRoute,
  options: WorkbenchRouteActivationOptions
): () => void {
  let scheduled = false;
  const enhance = () => {
    scheduled = false;
    const shell = scope.querySelector<HTMLElement>(`[data-uifn-workbench="${options.framework}"]`);
    shell?.setAttribute('data-uifn-framework-owned', 'true');
    for (const box of Array.from(scope.querySelectorAll<HTMLElement>('.qa-edge-box'))) enhanceBox(box, route);
    activateProductModels(scope);
    activateScenarios(scope);
    activateCatalogUi(scope);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(enhance);
  };
  const observer = new MutationObserver(schedule);
  const observerTarget =
    scope instanceof Node
      ? scope.ownerDocument?.body ?? scope
      : scope;
  observer.observe(observerTarget, { childList: true, subtree: true });
  enhance();
  const delayedEnhance = window.setTimeout(enhance, 50);
  return () => {
    window.clearTimeout(delayedEnhance);
    observer.disconnect();
  };
}
