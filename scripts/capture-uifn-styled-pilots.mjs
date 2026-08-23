#!/usr/bin/env node

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issueRoot = path.join(root, 'uifn/.conduct/issues/SFO-45');
const visualRoot = path.join(issueRoot, 'visual');
const publicCss = readFileSync(path.join(root, 'uifn/components/styles.css'), 'utf8');
const frameworks = {
  react: process.env.UIFN_REACT_CATALOG_URL ?? 'http://127.0.0.1:6111',
  svelte: process.env.UIFN_SVELTE_CATALOG_URL ?? 'http://127.0.0.1:6112',
  solid: process.env.UIFN_SOLID_CATALOG_URL ?? 'http://127.0.0.1:6114',
};
const themes = ['light', 'dark'];
const pilots = ['button', 'field', 'input', 'checkbox', 'switch', 'select', 'combobox', 'dialog', 'menu', 'tabs', 'card', 'table'];
const styleProperties = [
  'position', 'backgroundColor', 'color',
  'borderTopColor', 'borderTopStyle', 'borderTopWidth', 'borderRadius', 'boxShadow',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'gap', 'width', 'height', 'maxWidth', 'opacity', 'visibility', 'overflow',
  'clipPath', 'filter', 'transform',
  'textDecorationLine', 'whiteSpace',
];

rmSync(visualRoot, { recursive: true, force: true });
mkdirSync(visualRoot, { recursive: true });

function stable(value) {
  return JSON.stringify(value);
}

function comparableFixture(fixture) {
  return {
    recipe: fixture?.recipe,
    parts: fixture?.parts?.map((part) => ({
      ...part,
      style: Object.fromEntries(
        Object.entries(part.style ?? {}).filter(([property]) => property !== 'width' && property !== 'height'),
      ),
    })),
  };
}

function xml(value) {
  return String(value).replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[character]);
}

async function makeTile(buffer, label, dark) {
  const resized = await sharp(buffer)
    .resize({ width: 660, height: 610, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  const metadata = await sharp(resized).metadata();
  const background = dark ? '#111827' : '#f7f8fb';
  const foreground = dark ? '#f9fafb' : '#111827';
  const labelSvg = Buffer.from(
    `<svg width="680" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="680" height="40" fill="${background}"/><text x="12" y="26" font-family="ui-sans-serif,system-ui" font-size="16" font-weight="700" fill="${foreground}">${xml(label)}</text></svg>`,
  );
  return sharp({ create: { width: 680, height: 660, channels: 4, background } })
    .composite([
      { input: labelSvg, left: 0, top: 0 },
      { input: resized, left: Math.floor((680 - (metadata.width ?? 660)) / 2), top: 42 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function makeSheet(tiles, output) {
  const rows = Math.ceil(tiles.length / 2);
  await sharp({ create: { width: 1360, height: rows * 660, channels: 4, background: '#0b1020' } })
    .composite(tiles.map((input, index) => ({
      input,
      left: (index % 2) * 680,
      top: Math.floor(index / 2) * 660,
    })))
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function collectCatalog(page, pilot) {
  return page.locator('section.fixture-card').evaluateAll((sections, input) => {
    const recordStyle = (element) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(input.styleProperties.map((property) => [property, style[property]]));
    };
    return sections.map((section, fixtureIndex) => {
      const rootSelector = `[data-uifn-component="${input.pilot}"][data-uifn-part="root"]`;
      const componentRoot = section.querySelector(rootSelector);
      if (!componentRoot) return { fixtureIndex, missing: true };
      const parts = [componentRoot, ...componentRoot.querySelectorAll(`[data-uifn-component="${input.pilot}"][data-uifn-part]:not([data-uifn-part="root"])`)];
      const inputElement = componentRoot.matches('input, [data-uifn-part="input"]')
        ? componentRoot
        : componentRoot.querySelector('[data-uifn-part="input"]');
      return {
        fixtureIndex,
        label: section.querySelector('.eyebrow')?.textContent?.trim() ?? `fixture-${fixtureIndex + 1}`,
        html: componentRoot.outerHTML,
        metrics: {
          height: getComputedStyle(componentRoot).height,
          minHeight: getComputedStyle(componentRoot).minHeight,
          inputValue: inputElement?.value,
          inputPlaceholder: inputElement?.getAttribute('placeholder'),
          formHarnessCount: section.querySelectorAll('[data-uifn-form-harness]').length,
          dataControlsCount: section.querySelectorAll('[data-uifn-data-controls]').length,
        },
        recipe: {
          variant: componentRoot.getAttribute('data-uifn-variant'),
          size: componentRoot.getAttribute('data-uifn-size'),
          density: componentRoot.getAttribute('data-uifn-density'),
          unstyled: componentRoot.getAttribute('data-uifn-unstyled'),
        },
        parts: parts.map((part) => {
          const before = getComputedStyle(part, '::before');
          return {
            part: part.getAttribute('data-uifn-part'),
            tag: part.tagName.toLowerCase(),
            hidden: part.hidden,
            ariaChecked: part.getAttribute('aria-checked'),
            ariaSelected: part.getAttribute('aria-selected'),
            ariaDisabled: part.getAttribute('aria-disabled'),
            style: recordStyle(part),
            pseudoBefore: part.getAttribute('data-uifn-part') === 'indicator' ? {
              content: before.content,
              width: before.width,
              height: before.height,
              backgroundColor: before.backgroundColor,
              borderInlineEndWidth: before.borderInlineEndWidth,
              transform: before.transform,
            } : undefined,
          };
        }),
      };
    });
  }, { pilot, styleProperties });
}

async function collectBlank(blankPage, fixtures, themeStyle, theme, pilot) {
  await blankPage.setContent(`<style>${publicCss}</style><main id="blank-consumer"></main>`);
  await blankPage.locator('#blank-consumer').evaluate((main, input) => {
    main.setAttribute('data-uifn-theme', input.theme);
    main.setAttribute('style', input.themeStyle);
    main.innerHTML = input.fixtures.map((fixture, index) => `<section data-fixture-index="${index}">${fixture.html ?? ''}</section>`).join('');
  }, { fixtures, themeStyle, theme });
  return blankPage.locator('[data-fixture-index]').evaluateAll((sections, input) => {
    const recordStyle = (element) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(input.styleProperties.map((property) => [property, style[property]]));
    };
    return sections.map((section, fixtureIndex) => {
      const componentRoot = section.querySelector(`[data-uifn-component="${input.pilot}"][data-uifn-part="root"]`);
      if (!componentRoot) return { fixtureIndex, missing: true };
      const parts = [componentRoot, ...componentRoot.querySelectorAll(`[data-uifn-component="${input.pilot}"][data-uifn-part]:not([data-uifn-part="root"])`)];
      return {
        fixtureIndex,
        recipe: {
          variant: componentRoot.getAttribute('data-uifn-variant'),
          size: componentRoot.getAttribute('data-uifn-size'),
          density: componentRoot.getAttribute('data-uifn-density'),
          unstyled: componentRoot.getAttribute('data-uifn-unstyled'),
        },
        parts: parts.map((part) => {
          const before = getComputedStyle(part, '::before');
          return {
            part: part.getAttribute('data-uifn-part'),
            tag: part.tagName.toLowerCase(),
            hidden: part.hidden,
            ariaChecked: part.getAttribute('aria-checked'),
            ariaSelected: part.getAttribute('aria-selected'),
            ariaDisabled: part.getAttribute('aria-disabled'),
            style: recordStyle(part),
            pseudoBefore: part.getAttribute('data-uifn-part') === 'indicator' ? {
              content: before.content,
              width: before.width,
              height: before.height,
              backgroundColor: before.backgroundColor,
              borderInlineEndWidth: before.borderInlineEndWidth,
              transform: before.transform,
            } : undefined,
          };
        }),
      };
    });
  }, { pilot, styleProperties });
}

const browser = await chromium.launch({ headless: true });
const results = [];
const presentationProbes = [];
const artifacts = [];
const failures = [];
try {
  for (const [framework, baseUrl] of Object.entries(frameworks)) {
    for (const theme of themes) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', colorScheme: theme });
      const blankPage = await browser.newPage({ viewport: { width: 1200, height: 900 }, reducedMotion: 'reduce', colorScheme: theme });
      const tiles = [];
      for (const pilot of pilots) {
        const url = `${baseUrl}/components/${pilot}/states?theme=${theme}`;
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
        const rootSelector = `[data-uifn-component="${pilot}"][data-uifn-part="root"]`;
        await page.locator(rootSelector).first().waitFor({ state: 'attached', timeout: 15_000 });
        const themeStyle = await page.locator('.workbench-shell').getAttribute('style') ?? '';
        const catalog = await collectCatalog(page, pilot);
        const blank = await collectBlank(blankPage, catalog, themeStyle, theme, pilot);
        const parityFailures = [];
        for (let index = 0; index < catalog.length; index += 1) {
          const catalogComparable = comparableFixture(catalog[index]);
          const blankComparable = comparableFixture(blank[index]);
          if (stable(catalogComparable) !== stable(blankComparable)) {
            parityFailures.push({ fixtureIndex: index, label: catalog[index]?.label, catalog: catalogComparable, blank: blankComparable });
          }
        }
        if (!response?.ok() || catalog.some((fixture) => fixture.missing) || parityFailures.length) {
          failures.push({ framework, theme, pilot, status: response?.status(), parityFailures });
        }
        const screenshot = await page.locator('.fixture-grid').first().screenshot({ animations: 'disabled' });
        tiles.push(await makeTile(screenshot, `${pilot} · states`, theme === 'dark'));
        results.push({
          framework,
          theme,
          pilot,
          fixtureCount: catalog.length,
          rootCount: catalog.filter((fixture) => !fixture.missing).length,
          catalogBlankParity: parityFailures.length === 0,
          recipes: catalog.map((fixture) => ({ label: fixture.label, recipe: fixture.recipe, partCount: fixture.parts?.length ?? 0 })),
          visuals: catalog.map((fixture) => ({
            label: fixture.label,
            recipe: fixture.recipe,
            metrics: fixture.metrics,
            root: fixture.parts?.[0]?.style,
            control: fixture.parts?.find((part) => part.part === 'control'),
            indicator: fixture.parts?.find((part) => part.part === 'indicator'),
            input: fixture.parts?.find((part) => part.part === 'input'),
            header: fixture.parts?.find((part) => part.part === 'header'),
            selectedTrigger: fixture.parts?.find((part) => part.part === 'trigger' && part.ariaSelected === 'true'),
            unselectedTrigger: fixture.parts?.find((part) => part.part === 'trigger' && part.ariaSelected === 'false'),
          })),
        });
      }
      const commandUrl = `${baseUrl}/components/command/states?theme=${theme}`;
      const commandResponse = await page.goto(commandUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      const commandRoot = page.locator('[data-uifn-component="command"][data-uifn-part="root"]').first();
      await commandRoot.waitFor({ state: 'attached', timeout: 15_000 });
      presentationProbes.push(await commandRoot.evaluate((root, input) => {
        const commandInput = root.querySelector('[data-uifn-part="input"]');
        const inputStyle = commandInput ? getComputedStyle(commandInput) : null;
        const searchRing = getComputedStyle(root, '::before');
        const searchHandle = getComputedStyle(root, '::after');
        return {
          framework: input.framework,
          theme: input.theme,
          pilot: 'command',
          status: input.status,
          placeholder: commandInput?.getAttribute('placeholder') ?? '',
          inputPaddingInlineStart: inputStyle?.paddingInlineStart ?? '',
          placeholderColor: inputStyle?.color ?? '',
          searchRing: { content: searchRing.content, width: searchRing.width, height: searchRing.height, borderStyle: searchRing.borderStyle },
          searchHandle: { content: searchHandle.content, width: searchHandle.width, height: searchHandle.height, transform: searchHandle.transform },
          formHarnessCount: root.closest('section.fixture-card')?.querySelectorAll('[data-uifn-form-harness]').length ?? 0,
          dataControlsCount: root.closest('section.fixture-card')?.querySelectorAll('[data-uifn-data-controls]').length ?? 0,
        };
      }, { framework, theme, status: commandResponse?.status() ?? 0 }));
      for (let group = 0; group < 2; group += 1) {
        const filename = `${framework}-${theme}-pilots-${group + 1}.png`;
        const relative = `visual/${filename}`;
        await makeSheet(tiles.slice(group * 6, group * 6 + 6), path.join(issueRoot, relative));
        artifacts.push({ framework, theme, pilots: pilots.slice(group * 6, group * 6 + 6), path: `uifn/.conduct/issues/SFO-45/${relative}` });
      }
      await page.close();
      await blankPage.close();
    }
  }
} finally {
  await browser.close();
}

for (const theme of themes) {
  for (const pilot of pilots) {
    const profiles = Object.fromEntries(Object.keys(frameworks).map((framework) => {
      const result = results.find((entry) => entry.framework === framework && entry.theme === theme && entry.pilot === pilot);
      return [framework, result ? { fixtureCount: result.fixtureCount, recipes: result.recipes } : null];
    }));
    if (new Set(Object.values(profiles).map(stable)).size !== 1) failures.push({ theme, pilot, code: 'cross-framework-recipe-mismatch', profiles });
  }
}

for (const theme of themes) {
  const values = Object.fromEntries(Object.keys(frameworks).map((framework) => {
    const result = results.find((entry) => entry.framework === framework && entry.theme === theme && entry.pilot === 'combobox');
    return [framework, result?.visuals.map((visual) => ({ label: visual.label, inputValue: visual.metrics?.inputValue }))];
  }));
  if (new Set(Object.values(values).map(stable)).size !== 1) {
    failures.push({ theme, pilot: 'combobox', code: 'cross-framework-input-value-mismatch', values });
  }
}

for (const result of results.filter((entry) => entry.pilot === 'button')) {
  const defaultVisual = result.visuals.find((visual) => visual.label.toLowerCase() === 'default');
  const sizeContract = {
    sm: result.visuals.find((visual) => visual.recipe?.size === 'sm')?.metrics?.minHeight,
    md: defaultVisual?.metrics?.minHeight,
    lg: result.visuals.find((visual) => visual.recipe?.size === 'lg')?.metrics?.minHeight,
  };
  const variantSignatures = [
    defaultVisual?.root,
    ...['variant-secondary', 'variant-outline', 'variant-ghost', 'variant-danger']
      .map((label) => result.visuals.find((visual) => visual.recipe?.variant === label.replace('variant-', ''))?.root),
  ]
    .map((style) => stable({ background: style?.backgroundColor, color: style?.color, border: style?.borderTopColor }));
  if (stable(sizeContract) !== stable({ sm: '32px', md: '40px', lg: '48px' })) {
    failures.push({ framework: result.framework, theme: result.theme, pilot: 'button', code: 'button-size-contract-mismatch', sizeContract });
  }
  if (new Set(variantSignatures).size !== variantSignatures.length) {
    failures.push({ framework: result.framework, theme: result.theme, pilot: 'button', code: 'button-variant-visual-collision', variantSignatures });
  }
}

for (const result of results.filter((entry) => entry.pilot === 'checkbox')) {
  const unchecked = result.visuals.find((visual) => visual.label.toLowerCase() === 'unchecked');
  const checked = result.visuals.find((visual) => visual.label.toLowerCase() === 'checked');
  const indeterminate = result.visuals.find((visual) => visual.label.toLowerCase() === 'indeterminate');
  const checkedMarkVisible = checked?.indicator?.pseudoBefore?.content !== 'none'
    && checked?.indicator?.pseudoBefore?.width !== '0px'
    && checked?.indicator?.pseudoBefore?.height !== '0px';
  const mixedStateVisible = indeterminate?.control?.ariaChecked === 'mixed'
    && indeterminate.control.style?.backgroundColor !== unchecked?.control?.style?.backgroundColor
    && indeterminate.indicator?.hidden === false
    && indeterminate.indicator?.pseudoBefore?.content !== 'none'
    && indeterminate.indicator?.pseudoBefore?.width !== '0px';
  if (!checkedMarkVisible || !mixedStateVisible) {
    failures.push({
      framework: result.framework,
      theme: result.theme,
      pilot: 'checkbox',
      code: 'checkbox-indeterminate-visual-mismatch',
      unchecked: unchecked?.control,
      checked: checked?.indicator,
      indeterminate: {
        control: indeterminate?.control,
        indicator: indeterminate?.indicator,
      },
    });
  }
}

for (const result of results.filter((entry) => entry.pilot === 'input')) {
  const placeholderMismatch = result.visuals.some((visual) => visual.metrics?.inputPlaceholder !== 'you@company.com');
  if (placeholderMismatch) {
    failures.push({
      framework: result.framework,
      theme: result.theme,
      pilot: 'input',
      code: 'presentation-native-input-prop-not-forwarded',
      placeholders: result.visuals.map((visual) => ({ label: visual.label, placeholder: visual.metrics?.inputPlaceholder })),
    });
  }
}

for (const result of results) {
  const pollutedFixtures = result.visuals
    .filter((visual) => visual.metrics?.formHarnessCount || visual.metrics?.dataControlsCount)
    .map((visual) => ({
      label: visual.label,
      formHarnessCount: visual.metrics?.formHarnessCount,
      dataControlsCount: visual.metrics?.dataControlsCount,
    }));
  if (pollutedFixtures.length) {
    failures.push({
      framework: result.framework,
      theme: result.theme,
      pilot: result.pilot,
      code: 'presentation-public-state-contains-qa-harness',
      pollutedFixtures,
    });
  }
}

for (const result of results.filter((entry) => entry.pilot === 'switch')) {
  const checked = result.visuals.find((visual) => visual.label.toLowerCase() === 'checked');
  const disabled = result.visuals.find((visual) => visual.label.toLowerCase() === 'disabled');
  const checkedOpacity = Number.parseFloat(checked?.root?.opacity ?? '1');
  const disabledOpacity = Number.parseFloat(disabled?.root?.opacity ?? '1');
  if (!(disabledOpacity < checkedOpacity) || disabled?.root?.filter === checked?.root?.filter) {
    failures.push({
      framework: result.framework,
      theme: result.theme,
      pilot: 'switch',
      code: 'presentation-switch-disabled-not-distinct',
      checked: checked?.root,
      disabled: disabled?.root,
    });
  }
}

for (const result of results.filter((entry) => entry.pilot === 'tabs')) {
  const representative = result.visuals.find((visual) => visual.selectedTrigger && visual.unselectedTrigger);
  const indicator = representative?.indicator;
  const selectedSignature = stable({
    background: representative?.selectedTrigger?.style?.backgroundColor,
    color: representative?.selectedTrigger?.style?.color,
    shadow: representative?.selectedTrigger?.style?.boxShadow,
  });
  const unselectedSignature = stable({
    background: representative?.unselectedTrigger?.style?.backgroundColor,
    color: representative?.unselectedTrigger?.style?.color,
    shadow: representative?.unselectedTrigger?.style?.boxShadow,
  });
  const indicatorSuppressed = indicator?.style?.width === '1px'
    && indicator.style?.height === '1px'
    && indicator.style?.clipPath === 'inset(50%)';
  if (!representative || selectedSignature === unselectedSignature || !indicatorSuppressed) {
    failures.push({
      framework: result.framework,
      theme: result.theme,
      pilot: 'tabs',
      code: 'presentation-tabs-selection-or-indicator-mismatch',
      selectedSignature,
      unselectedSignature,
      indicator,
    });
  }
}

for (const result of results.filter((entry) => entry.pilot === 'card')) {
  const signatures = result.visuals.map((visual) => stable({
    border: visual.root?.borderTopColor,
    shadow: visual.root?.boxShadow,
    headerPadding: [
      visual.header?.style?.paddingTop,
      visual.header?.style?.paddingRight,
      visual.header?.style?.paddingBottom,
      visual.header?.style?.paddingLeft,
    ],
  }));
  if (signatures.length < 4 || new Set(signatures).size !== signatures.length) {
    failures.push({
      framework: result.framework,
      theme: result.theme,
      pilot: 'card',
      code: 'presentation-card-surface-collision',
      signatures,
    });
  }
}

for (const probe of presentationProbes) {
  const commandSearchVisible = probe.status >= 200
    && probe.status < 300
    && probe.placeholder.trim().length > 0
    && Number.parseFloat(probe.inputPaddingInlineStart) >= 40
    && probe.searchRing.content !== 'none'
    && probe.searchRing.width !== '0px'
    && probe.searchHandle.content !== 'none'
    && probe.searchHandle.width !== '0px';
  if (!commandSearchVisible || probe.formHarnessCount || probe.dataControlsCount) {
    failures.push({
      framework: probe.framework,
      theme: probe.theme,
      pilot: 'command',
      code: 'presentation-command-search-affordance-missing',
      probe,
    });
  }
}

const report = {
  schemaVersion: 1,
  issue: 'SFO-45',
  generatedAt: new Date().toISOString(),
  status: failures.length ? 'failed' : 'passed',
  browsers: ['chromium'],
  requiredFrameworks: Object.keys(frameworks),
  requiredThemes: themes,
  requiredPilots: pilots,
  catalogBlankParity: failures.every((failure) => !(failure.parityFailures?.length)),
  crossFrameworkRecipeParity: failures.every((failure) => failure.code !== 'cross-framework-recipe-mismatch'),
  presentationIntegrity: failures.every((failure) => !failure.code?.startsWith('presentation-')),
  presentationProbes,
  artifacts,
  results,
  failures,
};
writeFileSync(path.join(issueRoot, 'BROWSER_REVIEW.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: failures.length === 0, command: 'capture:uifn-styled-pilots', resultCount: results.length, artifacts, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
