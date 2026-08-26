#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const coreRoot = resolve(repoRoot, 'uifn/core');

const REQUIRED_LEGACY_SYMBOLS = Object.freeze([
  'StateMachine', 'createMachine', 'EventObject', 'StateConfig', 'Transition', 'MachineConfig',
  'createStore', 'PrimitiveStore', 'createCollapsibleMachine',
  'createAccordion', 'createAlertDialog', 'createAvatar', 'createCheckbox', 'createCollapsible',
  'createCombobox', 'createContextMenu', 'createDialog', 'createDropdownMenu', 'createHoverCard',
  'createMenuBar', 'createPopover', 'createProgress', 'createRadioGroup', 'createScrollArea',
  'createSelect', 'createSeparator', 'createSlider', 'createSwitch', 'createTabs', 'createToast',
  'createToggle', 'createToggleGroup', 'createToolbar', 'createTooltip',
  'createDropdownMenuController', 'createMenuBarController',
]);

const REQUIRED_CONTROLLER_FACTORIES = Object.freeze([
  'createAccordionController', 'createAlertDialogController',
  'createAutocompleteController', 'createCheckboxController', 'createCheckboxGroupController',
  'createClipboardController', 'createCollapsibleController', 'createComboboxController',
  'createContextMenuController', 'createDialogController', 'createMenuController',
  'createDrawerController', 'createEditableController', 'createFileUploadController',
  'createFloatingPanelController', 'createHoverCardController', 'createImageCropperController',
  'createListboxController', 'createMenubarController', 'createNavigationMenuController',
  'createNumberInputController', 'createPaginationController', 'createPasswordInputController',
  'createPinInputController', 'createPopoverController',
  'createProgressController', 'createRadioGroupController', 'createScrollAreaController',
  'createSegmentGroupController', 'createSelectController', 'createSliderController',
  'createSwitchController', 'createTabsController', 'createTagsInputController',
  'createToastController', 'createTreeViewController',
  'createToggleController', 'createToggleGroupController', 'createToolbarController',
  'createTooltipController', 'createTourController',
]);

const REMOVED_PROCESS_GLOBAL_ID_SYMBOLS = Object.freeze([
  'generateId', 'reusePublicId', 'registerPublicId', 'resetIdCounters',
  'getIdCounterSnapshot', 'getPublicIdSnapshot',
]);

const ALLOWED_EXPORTS = Object.freeze([
  '.', './aria', './aria/*', './utils', './errors', './controller',
  './utils/id', './environment', './parts', './algorithms', './primitives',
  './primitives/overlay', './primitives/*', './package.json',
]);

function collectFiles(directory, predicate, result = {}) {
  if (!existsSync(directory)) return result;
  for (const entry of readdirSync(directory).sort()) {
    const absolute = resolve(directory, entry);
    if (statSync(absolute).isDirectory()) {
      if (['node_modules', 'dist', '.conduct', '.next', '.svelte-kit', '.output', 'out', 'build', 'coverage'].includes(entry)) continue;
      collectFiles(absolute, predicate, result);
    } else if (predicate(absolute)) {
      result[relative(repoRoot, absolute).replaceAll('\\', '/')] = readFileSync(absolute, 'utf8');
    }
  }
  return result;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function issue(code, message, path) {
  return Object.freeze({ code, message, path });
}

function isCurrentSurface(path) {
  if (!path.startsWith('uifn/')) return false;
  if (/(?:^|\/)(?:__tests__|test|tests|fixtures|migrations|type-tests)(?:\/|$)/.test(path)) return false;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) return false;
  if (path.endsWith('/package.json')) return true;
  if (!path.includes('/src/') && !path.includes('/lib/')) return false;
  return /\.(?:[cm]?[jt]sx?|svelte)$/.test(path);
}

export function loadControllerContractInput({ requireDist = false } = {}) {
  const scanFiles = {
    ...collectFiles(resolve(repoRoot, 'uifn'), (file) => isCurrentSurface(relative(repoRoot, file).replaceAll('\\', '/'))),
    ...collectFiles(resolve(repoRoot, 'scripts'), (file) => isCurrentSurface(relative(repoRoot, file).replaceAll('\\', '/'))),
    'package.json': readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
  };
  const declarationFiles = collectFiles(
    resolve(coreRoot, 'dist'),
    (file) => file.endsWith('.d.ts') || file.endsWith('.d.mts'),
  );
  return {
    scanFiles,
    sourceFiles: collectFiles(resolve(coreRoot, 'src'), (file) => file.endsWith('.ts')),
    declarationFiles,
    packageJson: JSON.parse(readFileSync(resolve(coreRoot, 'package.json'), 'utf8')),
    migration: JSON.parse(readFileSync(resolve(coreRoot, 'migrations/removed-apis.json'), 'utf8')),
    controllerSource: readFileSync(resolve(coreRoot, 'src/controller.ts'), 'utf8'),
    requireDist,
  };
}

export function inspectControllerContract(input) {
  const issues = [];
  const removedSymbols = input.migration.removedSymbols ?? {};
  const removedPaths = input.migration.removedPaths ?? {};

  for (const symbol of REQUIRED_LEGACY_SYMBOLS) {
    if (!(symbol in removedSymbols)) {
      issues.push(issue(
        'UIFN_LEGACY_BEHAVIOR_PATH',
        `The breaking migration manifest does not account for removed symbol ${symbol}.`,
        'uifn/core/migrations/removed-apis.json',
      ));
    }
  }
  for (const symbol of REMOVED_PROCESS_GLOBAL_ID_SYMBOLS) {
    if (!(symbol in removedSymbols)) {
      issues.push(issue(
        'UIFN_LEGACY_BEHAVIOR_PATH',
        `The scope migration manifest does not account for removed global ID symbol ${symbol}.`,
        'uifn/core/migrations/removed-apis.json',
      ));
    }
    if (new RegExp(`export\\s+function\\s+${escapeRegExp(symbol)}\\b`).test(input.sourceFiles['uifn/core/src/utils/id.ts'] ?? '')) {
      issues.push(issue(
        'UIFN_CONTROLLER_CONTRACT_INVALID',
        `Process-global ID helper ${symbol} remains exported.`,
        'uifn/core/src/utils/id.ts',
      ));
    }
  }
  for (const path of ['@uifn/core/state', '@uifn/core/state/*', '@uifn/core/primitives/*', '@uifn/core/primitives/controller-adapters', '@uifn/core/primitives/controller-migration']) {
    if (!(path in removedPaths)) {
      issues.push(issue(
        'UIFN_LEGACY_BEHAVIOR_PATH',
        `The breaking migration manifest does not account for removed path ${path}.`,
        'uifn/core/migrations/removed-apis.json',
      ));
    }
  }

  const legacyPatterns = REQUIRED_LEGACY_SYMBOLS.map((symbol) => ({
    symbol,
    pattern: new RegExp(`\\b${escapeRegExp(symbol)}\\b`),
  }));
  const legacyPathPattern = /@uifn\/core\/state(?:\/[^'"`\s]*)?|@uifn\/core\/primitives\/(?:controller-adapters|controller-migration)\b|controller-adapters|controller-migration/;
  for (const [path, source] of Object.entries(input.scanFiles)) {
    for (const { symbol, pattern } of legacyPatterns) {
      if (pattern.test(source)) {
        issues.push(issue('UIFN_LEGACY_BEHAVIOR_PATH', `Removed legacy symbol ${symbol} remains in a current surface.`, path));
      }
    }
    if (legacyPathPattern.test(source)) {
      issues.push(issue('UIFN_LEGACY_BEHAVIOR_PATH', 'A removed legacy import/export path remains in a current surface.', path));
    }
  }

  const actualExports = Object.keys(input.packageJson.exports ?? {}).sort();
  const expectedExports = [...ALLOWED_EXPORTS].sort();
  if (JSON.stringify(actualExports) !== JSON.stringify(expectedExports)) {
    issues.push(issue(
      'UIFN_LEGACY_BEHAVIOR_PATH',
      'Core package exports differ from the reviewed explicit entrypoint allowlist.',
      'uifn/core/package.json',
    ));
  }

  const requiredMembers = [
    'readonly status:', 'readonly state:', 'readonly snapshot:', 'readonly actions:', 'readonly parts:',
    'getState():', 'getSnapshot():', 'update(inputs:', 'subscribe<TSelected', 'destroy():',
  ];
  for (const member of requiredMembers) {
    if (!input.controllerSource.includes(member)) {
      issues.push(issue(
        'UIFN_CONTROLLER_CONTRACT_INVALID',
        `The public UIFnController surface is missing ${member}.`,
        'uifn/core/src/controller.ts',
      ));
    }
  }

  const mappedFactories = Object.values(removedSymbols).filter((value) => /^create[A-Z][A-Za-z0-9]+Controller$/.test(value));
  const controllersWithoutRemovedPredecessors = new Set([
    'createImageCropperController', 'createDrawerController',
    'createFloatingPanelController', 'createTourController',
    'createNavigationMenuController', 'createPaginationController', 'createTreeViewController',
    'createAutocompleteController', 'createCheckboxGroupController', 'createClipboardController',
    'createEditableController', 'createFileUploadController', 'createListboxController',
    'createNumberInputController', 'createPasswordInputController', 'createPinInputController',
    'createSegmentGroupController', 'createTagsInputController',
  ]);
  const expectedLegacyMappings = REQUIRED_CONTROLLER_FACTORIES.filter((factory) => !controllersWithoutRemovedPredecessors.has(factory));
  if (JSON.stringify([...new Set(mappedFactories)].sort()) !== JSON.stringify([...expectedLegacyMappings].sort())) {
    issues.push(issue(
      'UIFN_CONTROLLER_CONTRACT_INVALID',
      'The migration manifest and implemented controller inventory differ.',
      'uifn/core/migrations/removed-apis.json',
    ));
  }

  const sourceText = Object.values(input.sourceFiles).join('\n');
  for (const factory of REQUIRED_CONTROLLER_FACTORIES) {
    if (!new RegExp(`\\b${escapeRegExp(factory)}\\b`).test(sourceText)) {
      issues.push(issue('UIFN_CONTROLLER_CONTRACT_INVALID', `Missing controller factory ${factory}.`, 'uifn/core/src/primitives'));
    }
  }

  const browserGlobalPattern = /globalThis\.(?:document|window|navigator)|\btypeof\s+(?:document|window|navigator)\b|(^|[^.\w])(?:document|window|navigator)\s*\./m;
  for (const [path, source] of Object.entries(input.sourceFiles)) {
    if (browserGlobalPattern.test(source)) {
      issues.push(issue('UIFN_CORE_BROWSER_GLOBAL', 'Core reads an ambient browser global.', path));
    }
    if (/\bglobalId(?:Registry|Factory)\b/.test(source)) {
      issues.push(issue('UIFN_CONTROLLER_CONTRACT_INVALID', 'Core retains process-global mutable ID state.', path));
    }
  }

  if (input.requireDist && Object.keys(input.declarationFiles).length === 0) {
    issues.push(issue('UIFN_CONTROLLER_CONTRACT_INVALID', 'Built declarations are required for public API verification.', 'uifn/core/dist'));
  }
  const declarationText = Object.values(input.declarationFiles).join('\n');
  if (input.requireDist) {
    const privateDeclarationPattern = /\b(?:StateMachine|createMachine|createStore|PrimitiveStore|createStateChannel|create[A-Z][A-Za-z0-9]*Model|[A-Z][A-Za-z0-9]*Model)\b|internal\/runtime/;
    for (const [path, source] of Object.entries(input.declarationFiles)) {
      if (privateDeclarationPattern.test(source)) {
        issues.push(issue('UIFN_LEGACY_BEHAVIOR_PATH', 'A public declaration leaks a private or removed behavior API.', path));
      }
    }
    for (const factory of REQUIRED_CONTROLLER_FACTORIES) {
      if (!new RegExp(`\\b${escapeRegExp(factory)}\\b`).test(declarationText)) {
        issues.push(issue('UIFN_CONTROLLER_CONTRACT_INVALID', `Built declarations omit ${factory}.`, 'uifn/core/dist/index.d.ts'));
      }
    }
  }

  return Object.freeze(issues);
}

export function classifyControllerMutations(mutations) {
  const codes = [];
  if (mutations.missingUpdate) codes.push('UIFN_CONTROLLER_CONTRACT_INVALID');
  if (mutations.legacyExport || mutations.legacyConsumer) codes.push('UIFN_LEGACY_BEHAVIOR_PATH');
  if (mutations.generatedFirst) codes.push('UIFN_HANDLER_ORDER_INVALID');
  if (mutations.invariantOverridden) codes.push('UIFN_PART_INVARIANT_OVERRIDDEN');
  if (mutations.browserGlobal) codes.push('UIFN_CORE_BROWSER_GLOBAL');
  if (mutations.missingCapability) codes.push('UIFN_ENV_CAPABILITY_MISSING');
  return Object.freeze(codes);
}

export function verifyControllerContract(options = {}) {
  const input = loadControllerContractInput(options);
  const issues = inspectControllerContract(input);
  return Object.freeze({
    ok: issues.length === 0,
    command: 'verify:uifn-controller-contract',
    requirements: ['ARCH-002', 'ARCH-003', 'PART-001', 'ENV-001'],
    vectors: [
      'TV-ARCH-002-P', 'TV-ARCH-002-N', 'TV-ARCH-003-P', 'TV-ARCH-003-N',
      'TV-PART-001-P', 'TV-PART-001-N', 'TV-ENV-001-P', 'TV-ENV-001-N',
    ],
    controllerCount: REQUIRED_CONTROLLER_FACTORIES.length,
    declarationFiles: Object.keys(input.declarationFiles).length,
    packageEntrypoints: Object.keys(input.packageJson.exports ?? {}),
    issues,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = verifyControllerContract({ requireDist: process.argv.includes('--require-dist') });
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
