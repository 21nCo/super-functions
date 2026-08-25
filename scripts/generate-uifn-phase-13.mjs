#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'uifn/catalog/generated/catalog.json');
const outputDirectory = path.join(root, 'uifn/solid/src/generated');
const manifestPath = path.join(root, 'uifn/evidence/generated/phase-13/phase-13-solid-compounds.json');
const allRootsHarnessPath = path.join(root, 'uifn/solid/src/__tests__/fixtures/AllRootsHarness.tsx');
const publicIndexPath = path.join(root, 'uifn/solid/src/index.ts');
const check = process.argv.includes('--check');
const write = process.argv.includes('--write');

if (!check && !write) {
  console.error('Usage: generate-uifn-phase-13.mjs --write|--check');
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

function primitiveModule(primitive) {
  const name = primitive.name;
  const input = propsType(primitive);
  const interactive = primitive.implementationKind === 'interactive-controller';
  const partsType = interactive ? `${name}Controller['parts']` : `${name}ContractParts`;
  const coreTypeImports = interactive
    ? `create${name}Controller, type ${input}, type ${name}Controller`
    : `${name}Contract, type ${input}, type ${name}ContractParts`;
  const runtimeField = interactive
    ? `createController: create${name}Controller as never,`
    : `contract: ${name}Contract as never,`;
  const host = rootPart(primitive);
  const hostName = `${name}${pascal(host.id)}`;
  const hostElement = intrinsic(host.element);
  const components = primitive.anatomy
    .filter((part) => part.id !== host.id)
    .map((part) => {
      const component = `${name}${pascal(part.id)}`;
      const renderer = `${component}Element`;
      const element = intrinsic(part.element);
      const many = part.cardinality === 'many';
      return `function ${renderer}(props: JSX.IntrinsicElements['${element}']): JSX.Element {
  return <${element} {...props} />;
}

export type ${component}Props = SolidPrimitivePartProps<${partsType}['${part.id}'], '${element}', ${many}>;
export function ${component}(props: ${component}Props): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={${name}Definition as never}
      part="${part.id}"
      element="${element}"
      renderElement={${renderer} as never}
      many={${many}}
      props={props as never}
    />
  );
}`;
    });
  const hasAnatomyRoot = primitive.anatomy.some((part) => part.id === 'root');
  const rootAlias = hasAnatomyRoot
    ? ''
    : `\nexport const ${name}Root = ${hostName};\nexport type ${name}RootProps = ${hostName}Props;`;
  const anatomyEntries = primitive.anatomy
    .filter((part) => part.id !== 'root')
    .map((part) => `${pascal(part.id)}: ${name}${pascal(part.id)}`);
  const namespaceRoot = hasAnatomyRoot ? `${name}Root` : hostName;
  const namespace = [`Provider: ${name}Provider`, `Root: ${namespaceRoot}`, ...anatomyEntries];
  const inputNames = [
    ...primitive.inputs.map((entry) => entry.name),
    ...(primitive.name === 'Accordion' ? ['type'] : []),
    ...(primitive.name === 'Carousel' ? ['dir'] : []),
  ];
  return `import { createContext, type JSX } from 'solid-js';
import { ${coreTypeImports} } from '@uifn/core/primitives/${primitive.id}';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ${name}Context = createContext<SolidPrimitiveContextValue<${input}>>();
export const ${name}Definition: SolidPrimitiveDefinition<${input}> = {
  name: '${name}',
  family: '${primitive.behaviorFamily}',
  kind: '${primitive.implementationKind}',
  rootPart: '${host.id}',
  inputNames: ${JSON.stringify(inputNames)},
  context: ${name}Context,
  ${runtimeField}
};

function ${hostName}Element(props: JSX.IntrinsicElements['${hostElement}']): JSX.Element {
  return <${hostElement} {...props} />;
}

export type ${hostName}Props = SolidPrimitiveRootProps<${input}, '${hostElement}'>;
export function ${hostName}(props: ${hostName}Props): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={${name}Definition} element="${hostElement}" renderElement={${hostName}Element as never} hydrationId={hydrationId} props={props as never} />;
}

${components.join('\n\n')}${rootAlias}

export const ${name}Provider = ${hostName};
export const ${name} = /* @__PURE__ */ Object.assign(${hostName}, { ${namespace.join(', ')} });
`;
}

const outputs = new Map();
const publicIndex = [];
const manifestPrimitives = [];
for (const primitive of catalog.primitives) {
  const filename = `${primitive.id}.tsx`;
  outputs.set(filename, primitiveModule(primitive));
  publicIndex.push(`export * from './generated/${primitive.id}.jsx';`);
  const host = rootPart(primitive);
  manifestPrimitives.push({
    id: primitive.id,
    name: primitive.name,
    kind: primitive.implementationKind,
    family: primitive.behaviorFamily,
    source: `src/generated/${filename}`,
    provider: `${primitive.name}Provider`,
    namespace: primitive.name,
    components: primitive.anatomy.map((part) => `${primitive.name}${pascal(part.id)}`),
    anatomy: primitive.anatomy,
    hostPart: host.id,
  });
}

const publicIndexSource = `export const solidPackage = {
  name: '@uifn/solid',
  layer: 'adapter',
  status: 'ga-candidate',
  sourcePolicy: 'clean-room',
} as const;

${publicIndex.join('\n')}
export * from './hooks/index.js';
export * from './props.js';
export * from './conformance/solid-conformance.js';
export type {
  SolidPrimitiveCompositionProps,
  SolidPrimitivePartProps,
  SolidPrimitiveRenderPayload,
  SolidPrimitiveRootProps,
} from './internal/compound.jsx';
`;

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
const allRootsHarness = `import type { JSX } from 'solid-js';
import { ${catalog.primitives.map((primitive) => primitive.name).join(', ')} } from '../../index.js';

export function AllRootsHarness(): JSX.Element {
  return (
    <>
      <div id="tour-target" />
${catalog.primitives.map((primitive) => {
  const host = primitive.name === 'Toast' ? `${primitive.name}.Provider` : `${primitive.name}.Root`;
  const required = requiredSamples[primitive.name] ? ` ${requiredSamples[primitive.name]}` : '';
  return `      <${host}${required} data-testid="${primitive.id}-root" />`;
}).join('\n')}
    </>
  );
}
`;

const outputHash = sha256(
  [...outputs].map(([name, source]) => `${name}\0${source}`).join('\0') + publicIndexSource + allRootsHarness,
);
const anatomyCount = manifestPrimitives.reduce((total, primitive) => total + primitive.anatomy.length, 0);
const manifest = `${JSON.stringify({
  schemaVersion: 1,
  phase: 'PHASE_13',
  generatedBy: 'generate-uifn-phase-13.mjs',
  implementationEvidence: true,
  catalogSha256: sha256(catalogSource),
  outputSha256: outputHash,
  primitiveCount: manifestPrimitives.length,
  anatomyCount,
  primitives: manifestPrimitives,
}, null, 2)}\n`;

function currentOutputs() {
  if (!existsSync(outputDirectory)) return new Map();
  return new Map(
    readdirSync(outputDirectory)
      .filter((name) => /\.(?:ts|tsx)$/.test(name))
      .map((name) => [name, readFileSync(path.join(outputDirectory, name), 'utf8')]),
  );
}

if (write) {
  rmSync(outputDirectory, { recursive: true, force: true });
  mkdirSync(outputDirectory, { recursive: true });
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  mkdirSync(path.dirname(allRootsHarnessPath), { recursive: true });
  for (const [filename, source] of outputs) writeFileSync(path.join(outputDirectory, filename), source);
  writeFileSync(publicIndexPath, publicIndexSource);
  writeFileSync(allRootsHarnessPath, allRootsHarness);
  writeFileSync(manifestPath, manifest);
  console.log(JSON.stringify({
    ok: true,
    command: 'generate:uifn-phase-13',
    primitiveCount: manifestPrimitives.length,
    anatomyCount,
    outputSha256: outputHash,
  }, null, 2));
  process.exit(0);
}

const current = currentOutputs();
const issues = [];
for (const [name, expected] of outputs) if (current.get(name) !== expected) issues.push(`generated Solid source drift: ${name}`);
for (const name of current.keys()) if (!outputs.has(name)) issues.push(`unexpected generated Solid source: ${name}`);
if (!existsSync(publicIndexPath) || readFileSync(publicIndexPath, 'utf8') !== publicIndexSource) issues.push('Solid public index drift');
if (!existsSync(allRootsHarnessPath) || readFileSync(allRootsHarnessPath, 'utf8') !== allRootsHarness) issues.push('Solid all-roots harness drift');
if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifest) issues.push('phase-13 Solid manifest drift');
console.log(JSON.stringify({ ok: issues.length === 0, command: 'generate:uifn-phase-13 --check', primitiveCount: manifestPrimitives.length, issues }, null, 2));
process.exit(issues.length === 0 ? 0 : 1);
