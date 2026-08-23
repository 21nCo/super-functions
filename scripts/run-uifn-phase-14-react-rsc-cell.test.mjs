import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runPhase14ReactRscCell } from './run-uifn-phase-14-react-rsc-cell.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'uifn-phase14-rsc-'));
  const reactRoot = path.join(root, 'node_modules', 'react');
  const adapterRoot = path.join(root, 'node_modules', '@uifn', 'react');
  const generatedRoot = path.join(adapterRoot, 'generated');
  mkdirSync(reactRoot, { recursive: true });
  mkdirSync(generatedRoot, { recursive: true });
  writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  writeFileSync(path.join(reactRoot, 'package.json'), '{"name":"react","version":"18.3.1","main":"index.js"}\n');
  writeFileSync(path.join(reactRoot, 'index.js'), 'exports.version = "18.3.1";\n');
  writeFileSync(path.join(adapterRoot, 'package.json'), `${JSON.stringify({
    name: '@uifn/react',
    version: '0.0.1',
    main: 'index.js',
    exports: { '.': './index.js', './*': './generated/*.js' },
  })}\n`);
  writeFileSync(path.join(adapterRoot, 'index.js'), "'use client';\nexports.Root = function Root() {};\n");
  const vectors = Array.from({ length: 69 }, (_, index) => ({ primitive: `Primitive${index}`, primitiveId: `primitive-${index}` }));
  for (const vector of vectors) {
    writeFileSync(path.join(generatedRoot, `${vector.primitiveId}.js`), `'use client';\nexports.${vector.primitive} = function ${vector.primitive}() {};\n`);
  }
  return { root, vectors, generatedRoot };
}

test('accepts 62 explicit client-boundary entries with no browser globals', async () => {
  const { root, vectors } = fixture();
  const traces = await runPhase14ReactRscCell({ cellId: 'react-18.3-rsc-import', consumerRoot: root, vectors });
  assert.equal(traces.length, 69);
  assert(traces.every((trace) => trace.clientBoundary && trace.domGlobalsPresent === false));
});

test('rejects a direct entry that loses its use-client boundary', async () => {
  const { root, vectors, generatedRoot } = fixture();
  writeFileSync(path.join(generatedRoot, 'primitive-7.js'), 'exports.Primitive7 = function Primitive7() {};\n');
  await assert.rejects(
    runPhase14ReactRscCell({ cellId: 'react-18.3-rsc-import', consumerRoot: root, vectors }),
    /not an explicit React client boundary/,
  );
});
