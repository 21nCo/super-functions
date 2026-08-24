#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalogPath = path.join(root, 'uifn/catalog/generated/catalog.json');
const outputDirectory = path.join(root, 'uifn/react/src/generated');
const manifestPath = path.join(root, 'uifn/evidence/generated/phase-11/phase-11-react-compounds.json');
const check = process.argv.includes('--check');
const write = process.argv.includes('--write');

if (!check && !write) {
  console.error('Usage: generate-uifn-phase-11.mjs --write|--check');
  process.exit(2);
}

const catalogSource = readFileSync(catalogPath, 'utf8');
const catalog = JSON.parse(catalogSource);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const pascal = (value) => value.split(/[-_]/).filter(Boolean).map((segment) => segment[0].toUpperCase() + segment.slice(1)).join('');
const intrinsic = (value) => value === 'heading' ? 'h2' : value;
const propsType = (primitive) => primitive.name === 'HoverCard' ? 'CreateHoverCardProps' : `${primitive.name}Props`;

function primitiveModule(primitive) {
  const name = primitive.name;
  const input = propsType(primitive);
  const interactive = primitive.implementationKind === 'interactive-controller';
  const controller = `${name}Controller`;
  const contract = `${name}Contract`;
  const partsType = interactive ? `${controller}['parts']` : `${name}ContractParts`;
  const coreImports = interactive
    ? `create${name}Controller, type ${input}, type ${controller}`
    : `${contract}, type ${input}, type ${name}ContractParts`;
  const definitionRuntime = interactive
    ? `createController: create${name}Controller as never,`
    : `contract: ${contract} as never,`;
  const requiredInputs = primitive.inputs.some((entry) => entry.required);
  const defaultInput = requiredInputs ? '' : ' = {} as ' + input;
  const rootPart = primitive.name === 'Toast'
    ? primitive.anatomy.find((part) => part.id === 'viewport')
    : primitive.anatomy.find((part) => part.id === 'root') ?? primitive.anatomy[0];
  const rootName = rootPart.id === 'root' ? `${name}Root` : `${name}${pascal(rootPart.id)}`;
  const components = primitive.anatomy.map((part) => {
    const component = `${name}${pascal(part.id)}`;
    const element = intrinsic(part.element);
    const many = part.cardinality === 'many';
    const partType = `${partsType}['${part.id}']`;
    const props = `${component}Props`;
    return `export type ${props} = ReactPrimitivePartProps<${partType}, '${element}', ${many}>;
export const ${component} = React.forwardRef<React.ElementRef<'${element}'>, ${props}>((props, ref) => (
  <ReactPrimitivePart definition={${name}Definition as never} part="${part.id}" element="${element}" many={${many}} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
${component}.displayName = '${component}';`;
  });
  const namespaceEntries = primitive.anatomy.map((part) => `${pascal(part.id)}: ${name}${pascal(part.id)}`).join(', ');
  const hookState = interactive ? `${controller}['state']` : `ReturnType<typeof ${contract}.getState>`;
  const hookActions = interactive ? `${controller}['actions']` : 'Record<string, never>';
  const inputNames = [
    ...primitive.inputs.map((entry) => entry.name),
    ...(primitive.name === 'Accordion' ? ['type'] : []),
  ];
  return `'use client';

import * as React from 'react';
import { ${coreImports} } from '@uifn/core/primitives/${primitive.id}';
import {
  ReactPrimitivePart,
  ReactPrimitiveRoot,
  useReactPrimitive,
  type ReactPrimitiveBridge,
  type ReactPrimitiveDefinition,
  type ReactPrimitiveHookResult,
  type ReactPrimitivePartProps,
  type ReactPrimitiveRootProps,
} from '../internal/compound';

const ${name}Context = React.createContext<ReactPrimitiveBridge<${input}> | null>(null);
const ${name}Definition: ReactPrimitiveDefinition<${input}> = {
  name: '${name}',
  family: '${primitive.behaviorFamily}',
  kind: '${primitive.implementationKind}',
  rootPart: '${rootPart.id}',
  inputNames: ${JSON.stringify(inputNames)},
  context: ${name}Context,
  ${definitionRuntime}
};

export type ${rootName}Props = ReactPrimitiveRootProps<${input}, '${intrinsic(rootPart.element)}'>;
export const ${rootName} = React.forwardRef<React.ElementRef<'${intrinsic(rootPart.element)}'>, ${rootName}Props>((props, ref) => (
  <ReactPrimitiveRoot definition={${name}Definition} element="${intrinsic(rootPart.element)}" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
${rootName}.displayName = '${rootName}';

${components.filter((_, index) => primitive.anatomy[index].id !== rootPart.id).join('\n\n')}

export const ${name}Provider = ${rootName};
export function use${name}(inputs: ${input}${defaultInput}): ReactPrimitiveHookResult<${hookState}, ${hookActions}> {
  return useReactPrimitive(${name}Definition, inputs) as ReactPrimitiveHookResult<${hookState}, ${hookActions}>;
}
export const ${name} = Object.assign(${rootName}, { Provider: ${name}Provider, ${namespaceEntries} });
`;
}

const outputs = new Map();
const indexLines = [];
const manifestPrimitives = [];
for (const primitive of catalog.primitives) {
  const filename = `${primitive.id}.tsx`;
  const source = primitiveModule(primitive);
  outputs.set(filename, source);
  indexLines.push(`export * from './${primitive.id}';`);
  manifestPrimitives.push({
    id: primitive.id,
    name: primitive.name,
    kind: primitive.implementationKind,
    family: primitive.behaviorFamily,
    source: `src/generated/${filename}`,
    hook: `use${primitive.name}`,
    provider: `${primitive.name}Provider`,
    namespace: primitive.name,
    components: primitive.anatomy.map((part) => `${primitive.name}${pascal(part.id)}`),
    anatomy: primitive.anatomy,
  });
}
outputs.set('index.ts', `${indexLines.join('\n')}\n`);
const outputHash = sha256([...outputs].map(([name, source]) => `${name}\0${source}`).join('\0'));
const manifest = `${JSON.stringify({
  schemaVersion: 1,
  phase: 'PHASE_11',
  generatedBy: 'generate-uifn-phase-11.mjs',
  implementationEvidence: true,
  catalogSha256: sha256(catalogSource),
  outputSha256: outputHash,
  primitiveCount: manifestPrimitives.length,
  primitives: manifestPrimitives,
}, null, 2)}\n`;

function currentOutputs() {
  if (!existsSync(outputDirectory)) return new Map();
  return new Map(readdirSync(outputDirectory).filter((name) => /\.(?:ts|tsx)$/.test(name)).map((name) => [name, readFileSync(path.join(outputDirectory, name), 'utf8')]));
}

if (write) {
  mkdirSync(outputDirectory, { recursive: true });
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  for (const name of readdirSync(outputDirectory)) {
    if (/\.(?:ts|tsx)$/.test(name) && !outputs.has(name)) rmSync(path.join(outputDirectory, name));
  }
  for (const [name, source] of outputs) writeFileSync(path.join(outputDirectory, name), source);
  writeFileSync(manifestPath, manifest);
  console.log(JSON.stringify({ ok: true, command: 'generate:uifn-phase-11', primitiveCount: manifestPrimitives.length, outputSha256: outputHash }, null, 2));
  process.exit(0);
}

const current = currentOutputs();
const issues = [];
for (const [name, expected] of outputs) if (current.get(name) !== expected) issues.push(`generated React source drift: ${name}`);
for (const name of current.keys()) if (!outputs.has(name)) issues.push(`unexpected generated React source: ${name}`);
if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifest) issues.push('phase-11 React manifest drift');
console.log(JSON.stringify({ ok: issues.length === 0, command: 'generate:uifn-phase-11 --check', primitiveCount: manifestPrimitives.length, issues }, null, 2));
process.exit(issues.length === 0 ? 0 : 1);
