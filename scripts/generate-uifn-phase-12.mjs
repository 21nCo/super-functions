#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'uifn/catalog/generated/catalog.json');
const outputDirectory = path.join(root, 'uifn/svelte/lib/generated');
const manifestPath = path.join(root, 'uifn/evidence/generated/phase-12/phase-12-svelte-compounds.json');
const allRootsHarnessPath = path.join(root, 'uifn/svelte/tests/fixtures/AllRootsHarness.svelte');
const check = process.argv.includes('--check');
const write = process.argv.includes('--write');

if (!check && !write) {
  console.error('Usage: generate-uifn-phase-12.mjs --write|--check');
  process.exit(2);
}

const catalogSource = readFileSync(catalogPath, 'utf8');
const catalog = JSON.parse(catalogSource);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const pascal = (value) => value.split(/[-_]/).filter(Boolean).map((segment) => segment[0].toUpperCase() + segment.slice(1)).join('');
const intrinsic = (value) => value === 'heading' ? 'h2' : value;
const propsType = (primitive) => primitive.name === 'HoverCard' ? 'CreateHoverCardProps' : `${primitive.name}Props`;

function rootPart(primitive) {
  return primitive.name === 'Toast'
    ? primitive.anatomy.find((part) => part.id === 'viewport')
    : primitive.anatomy.find((part) => part.id === 'root') ?? primitive.anatomy[0];
}

function callbackBindings(primitive) {
  const values = primitive.controlledModel?.valueInputs ?? [];
  const events = primitive.controlledModel?.changeEvents ?? [];
  return values.map((value, index) => {
    const event = events[index] ?? `${value.toUpperCase()}_CHANGE`;
    if (event === 'NATIVE_CHANGE') return { value, callback: null };
    const stem = event.replace(/_CHANGE$/, '').toLowerCase().split('_').map(pascal).join('');
    return { value, callback: `on${stem}Change` };
  });
}

function definitionModule(primitive) {
  const name = primitive.name;
  const input = propsType(primitive);
  const interactive = primitive.implementationKind === 'interactive-controller';
  const runtimeImport = interactive ? `create${name}Controller` : `${name}Contract`;
  const runtimeField = interactive
    ? `createController: create${name}Controller as never,`
    : `contract: ${name}Contract as never,`;
  return `import { ${runtimeImport}, type ${input} } from '@uifn/core/primitives/${primitive.id}';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const ${name}Definition: SveltePrimitiveDefinition<${input}> = {
  name: '${name}',
  family: '${primitive.behaviorFamily}',
  kind: '${primitive.implementationKind}',
  rootPart: '${rootPart(primitive).id}',
  inputNames: ${JSON.stringify([
    ...primitive.inputs.map((entry) => entry.name),
    ...(primitive.name === 'Accordion' ? ['type'] : []),
    ...(primitive.name === 'Carousel' ? ['dir'] : []),
  ])},
  contextKey: Symbol('uifn.${name}'),
  ${runtimeField}
};
`;
}

function rootComponent(primitive) {
  const name = primitive.name;
  const input = propsType(primitive);
  const root = rootPart(primitive);
  const element = intrinsic(root.element);
  const bindings = callbackBindings(primitive);
  const valueNames = bindings.map(({ value }) => value);
  const callbackNames = bindings.flatMap(({ callback }) => callback ? [callback] : []);
  const nativeInput = primitive.implementationKind === 'typed-static-contract'
    && primitive.controlledModel?.changeEvents?.includes('NATIVE_CHANGE')
    && element === 'input';
  const adapterOnlyBindings = primitive.name === 'FileUpload'
    ? ` & { files?: Parameters<NonNullable<${input}['onFilesChange']>>[0] }`
    : '';
  const destructured = [
    ...valueNames.map((value) => `${value} = $bindable()`),
    ...callbackNames,
    ...(nativeInput ? ['oninput'] : []),
    'children',
    'render',
    'ref = $bindable(null)',
    '...rest',
  ];
  const handlers = bindings.filter(({ callback }) => callback).map(({ value, callback }) => `  const handle${pascal(value)}Change = (next: Parameters<NonNullable<${input}['${callback}']>>[0]) => {
    ${value} = next;
    ${callback}?.(next);
  };`).join('\n');
  const nativeHandler = nativeInput ? `  const handleInput = (event: Event) => {
    ${valueNames[0]} = (event.currentTarget as HTMLInputElement).value as typeof ${valueNames[0]};
    (oninput as ((event: Event) => void) | null | undefined)?.(event);
  };` : '';
  const runtimeEntries = [
    '...rest',
    ...valueNames,
    ...bindings.filter(({ callback }) => callback).map(({ value, callback }) => `${callback}: handle${pascal(value)}Change`),
    ...(nativeInput ? ['oninput: handleInput'] : []),
  ];
  return `<script lang="ts">
  import type { ${input} } from '@uifn/core/primitives/${primitive.id}';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ${name}Definition } from './definition.js';

  type Props = SveltePrimitiveRootProps<${input}, '${element}'>${adapterOnlyBindings};
  let { ${destructured.join(', ')} }: Props = $props();
${handlers}${handlers && nativeHandler ? '\n' : ''}${nativeHandler}
  const runtimeProps = $derived({ ${runtimeEntries.join(', ')} });
</script>

<PrimitiveRoot
  definition={${name}Definition}
  element="${element}"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
`;
}

function partComponent(primitive, part) {
  const name = primitive.name;
  const interactive = primitive.implementationKind === 'interactive-controller';
  const partsType = interactive ? `${name}Controller['parts']` : `${name}ContractParts`;
  const coreTypeImport = interactive ? `${name}Controller` : `${name}ContractParts`;
  const element = intrinsic(part.element);
  const many = part.cardinality === 'many';
  return `<script lang="ts">
  import type { ${coreTypeImport} } from '@uifn/core/primitives/${primitive.id}';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { ${name}Definition } from './definition.js';

  type Props = SveltePrimitivePartProps<${partsType}['${part.id}'], '${element}', ${many}>;
  let {
    value,
    forceMount = false,
    container,
    children,
    render,
    ref = $bindable(null),
    ...rest
  }: Props = $props();
</script>

<PrimitivePart
  definition={${name}Definition}
  part="${part.id}"
  element="${element}"
  many={${many}}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
`;
}

function indexModule(primitive) {
  const name = primitive.name;
  const root = rootPart(primitive);
  const rootComponentName = `${name}${pascal(root.id)}`;
  const imports = primitive.anatomy.map((part) => {
    const component = `${name}${pascal(part.id)}`;
    return `import ${component}Component from './${pascal(part.id)}.svelte';`;
  });
  const declarations = primitive.anatomy.map((part) => {
    const component = `${name}${pascal(part.id)}`;
    return `export const ${component} = ${component}Component;\nexport type ${component}Props = ComponentProps<typeof ${component}Component>;`;
  });
  const hasAnatomyRoot = primitive.anatomy.some((part) => part.id === 'root');
  const rootAlias = hasAnatomyRoot
    ? ''
    : `\nexport const ${name}Root = ${rootComponentName};\nexport type ${name}RootProps = ${rootComponentName}Props;`;
  const anatomyEntries = primitive.anatomy
    .filter((part) => part.id !== 'root')
    .map((part) => `${pascal(part.id)}: ${name}${pascal(part.id)}`);
  const namespaceRoot = hasAnatomyRoot ? `${name}Root` : rootComponentName;
  const namespace = [`Provider: ${name}Provider`, `Root: ${namespaceRoot}`, ...anatomyEntries];
  return `import type { ComponentProps } from 'svelte';
${imports.join('\n')}

${declarations.join('\n\n')}${rootAlias}

export const ${name}Provider = ${rootComponentName};
export const ${name} = Object.assign(${rootComponentName}, { ${namespace.join(', ')} });
`;
}

const outputs = new Map();
const publicIndex = [];
const manifestPrimitives = [];
for (const primitive of catalog.primitives) {
  const directory = primitive.id;
  outputs.set(`${directory}/definition.ts`, definitionModule(primitive));
  const root = rootPart(primitive);
  for (const part of primitive.anatomy) {
    outputs.set(
      `${directory}/${pascal(part.id)}.svelte`,
      part.id === root.id ? rootComponent(primitive) : partComponent(primitive, part),
    );
  }
  outputs.set(`${directory}/index.ts`, indexModule(primitive));
  publicIndex.push(`export * from './generated/${primitive.id}/index.js';`);
  manifestPrimitives.push({
    id: primitive.id,
    name: primitive.name,
    kind: primitive.implementationKind,
    family: primitive.behaviorFamily,
    source: `lib/generated/${primitive.id}/${pascal(root.id)}.svelte`,
    module: `lib/generated/${primitive.id}/index.ts`,
    provider: `${primitive.name}Provider`,
    namespace: primitive.name,
    components: primitive.anatomy.map((part) => `${primitive.name}${pascal(part.id)}`),
    anatomy: primitive.anatomy,
    bindableValues: callbackBindings(primitive).map(({ value }) => value),
  });
}

const publicIndexSource = `${publicIndex.join('\n')}\nexport * from './hooks/index.js';\nexport * from './internal/index.js';\n`;
const requiredSamples = {
  Autocomplete: 'items={[]}',
  Avatar: 'alt="Avatar"',
  Carousel: 'itemCount={1}',
  Combobox: 'items={[]}',
  ImageCropper: 'src="/image.png"',
  Listbox: 'items={[]}',
  Meter: 'value={50}',
  Pagination: 'count={10}',
  QRCode: 'value="uifn" label="UIFn QR code"',
  Select: 'items={[]}',
  Steps: 'count={3}',
  Timer: 'duration={1000}',
  Tour: 'steps={[{ id: "one", title: "One", description: "One", target: "#tour-target" }]}',
  TreeView: 'items={[{ id: "one", textValue: "One" }]}',
};
const allRootsHarness = `<script lang="ts">\n  import { ${catalog.primitives.map((primitive) => primitive.name).join(', ')} } from '../../lib/index.js';\n</script>\n\n<div id="tour-target"></div>\n${catalog.primitives.map((primitive) => {
  const host = primitive.name === 'Toast' ? `${primitive.name}.Provider` : `${primitive.name}.Root`;
  const required = requiredSamples[primitive.name] ? ` ${requiredSamples[primitive.name]}` : '';
  return `<${host}${required} data-testid="${primitive.id}-root" />`;
}).join('\n')}\n`;
const outputHash = sha256(
  [...outputs].map(([name, source]) => `${name}\0${source}`).join('\0') + publicIndexSource + allRootsHarness,
);
const manifest = `${JSON.stringify({
  schemaVersion: 1,
  phase: 'PHASE_12',
  generatedBy: 'generate-uifn-phase-12.mjs',
  implementationEvidence: true,
  catalogSha256: sha256(catalogSource),
  outputSha256: outputHash,
  primitiveCount: manifestPrimitives.length,
  anatomyCount: manifestPrimitives.reduce((total, primitive) => total + primitive.anatomy.length, 0),
  primitives: manifestPrimitives,
}, null, 2)}\n`;

function currentOutputs() {
  const found = new Map();
  if (!existsSync(outputDirectory)) return found;
  for (const directory of readdirSync(outputDirectory, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const absolute = path.join(outputDirectory, directory.name);
    for (const filename of readdirSync(absolute)) {
      if (!/\.(?:ts|svelte)$/.test(filename)) continue;
      const relative = `${directory.name}/${filename}`;
      found.set(relative, readFileSync(path.join(absolute, filename), 'utf8'));
    }
  }
  return found;
}

if (write) {
  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  for (const [relative, source] of outputs) {
    const target = path.join(outputDirectory, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  writeFileSync(path.join(root, 'uifn/svelte/lib/index.ts'), publicIndexSource);
  mkdirSync(path.dirname(allRootsHarnessPath), { recursive: true });
  writeFileSync(allRootsHarnessPath, allRootsHarness);
  writeFileSync(manifestPath, manifest);
  console.log(JSON.stringify({
    ok: true,
    command: 'generate:uifn-phase-12',
    primitiveCount: manifestPrimitives.length,
    anatomyCount: manifestPrimitives.reduce((total, primitive) => total + primitive.anatomy.length, 0),
    outputSha256: outputHash,
  }, null, 2));
  process.exit(0);
}

const current = currentOutputs();
const issues = [];
for (const [name, expected] of outputs) if (current.get(name) !== expected) issues.push(`generated Svelte source drift: ${name}`);
for (const name of current.keys()) if (!outputs.has(name)) issues.push(`unexpected generated Svelte source: ${name}`);
if (!existsSync(path.join(root, 'uifn/svelte/lib/index.ts')) || readFileSync(path.join(root, 'uifn/svelte/lib/index.ts'), 'utf8') !== publicIndexSource) issues.push('Svelte public index drift');
if (!existsSync(allRootsHarnessPath) || readFileSync(allRootsHarnessPath, 'utf8') !== allRootsHarness) issues.push('Svelte all-roots harness drift');
if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifest) issues.push('phase-12 Svelte manifest drift');
console.log(JSON.stringify({ ok: issues.length === 0, command: 'generate:uifn-phase-12 --check', primitiveCount: manifestPrimitives.length, issues }, null, 2));
process.exit(issues.length === 0 ? 0 : 1);
