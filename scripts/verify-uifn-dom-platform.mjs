#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionRoots = ['uifn/react/src', 'uifn/svelte/lib', 'uifn/solid/src'];

function sourceFiles(root) {
  const result = [];
  const visit = (relative) => {
    const absolute = path.join(repoRoot, relative);
    for (const entry of readdirSync(absolute)) {
      const child = path.join(relative, entry);
      const childAbsolute = path.join(repoRoot, child);
      if (statSync(childAbsolute).isDirectory()) {
        if (!['__tests__', 'testing', 'test'].includes(entry)) visit(child);
      } else if (/\.(?:ts|tsx|svelte)$/.test(entry) && !/\.test\./.test(entry)) {
        result.push(child);
      }
    }
  };
  visit(root);
  return result;
}

const rules = [
  {
    code: 'UIFN_ROOT_LISTENER_DUPLICATE',
    pattern: /\b(?:document|window|ownerDocument)\.addEventListener\s*\(/,
    message: 'Framework production code installs a root listener instead of using @uifn/dom delegation.',
  },
  {
    code: 'UIFN_LAYER_OUTSIDE_CLASSIFICATION',
    pattern: /@uifn\/core\/utils\/(?:outside-click|escape-key)|createOutsideClickListener|createEscapeKeyListener/,
    message: 'Framework production code uses a local outside/Escape classifier.',
  },
  {
    code: 'UIFN_FOCUS_SCOPE_ESCAPE',
    pattern: /@uifn\/core\/utils\/focus-trap|createFocusTrap\s*\(/,
    message: 'Framework production code uses a local focus trap.',
  },
  {
    code: 'UIFN_POSITION_OUT_OF_BOUNDARY',
    pattern: /@uifn\/core\/utils\/position|\bcomputePosition\s*\([^)]*getBoundingClientRect/,
    message: 'Framework production code uses a local floating-position algorithm.',
  },
  {
    code: 'UIFN_SCROLL_LOCK_NESTING',
    pattern: /(?:body|document\.body)\.style\.overflow\s*=|bodyScrollLockCount|bodyScrollLockState/,
    message: 'Framework production code owns a local scroll-lock counter or mutation.',
  },
  {
    code: 'UIFN_PORTAL_HYDRATION_DUPLICATE',
    pattern: /@uifn\/core\/utils\/portal|createPortalMount\s*\(/,
    message: 'Framework production code uses a local portal mount algorithm.',
  },
  {
    code: 'UIFN_FRAMEWORK_BEHAVIOR_FORK',
    pattern: /@uifn\/core\/utils\/presence|detectNodeMotion\s*\(/,
    message: 'Framework production code uses a local presence/motion observer.',
  },
];

const requiredDomBindings = [
  'uifn/react/src/internal/compound.tsx',
  'uifn/react/src/portal.tsx',
  'uifn/react/src/presence.tsx',
  'uifn/svelte/lib/internal/compound.ts',
  'uifn/solid/src/internal/compound.tsx',
];

export function verifyUIFnDomPlatform(virtualSources = null) {
  const sources = virtualSources ?? Object.fromEntries(
    productionRoots.flatMap(sourceFiles).map((file) => [file, readFileSync(path.join(repoRoot, file), 'utf8')]),
  );
  const violations = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const rule of rules) {
      if (rule.pattern.test(source)) violations.push({ code: rule.code, file, message: rule.message });
    }
  }
  if (!virtualSources) {
    for (const file of requiredDomBindings) {
      const source = readFileSync(path.join(repoRoot, file), 'utf8');
      if (!source.includes("from '@uifn/dom'")) {
        violations.push({
          code: 'UIFN_FRAMEWORK_BEHAVIOR_FORK',
          file,
          message: 'Required framework binding does not consume the @uifn/dom public entrypoint.',
        });
      }
    }
  }
  return {
    ok: violations.length === 0,
    command: 'verify:uifn-dom-platform',
    scannedFiles: Object.keys(sources).length,
    violations,
  };
}

function negativeFixture() {
  return {
    'fixture/react-local-listener.ts': "document.addEventListener('pointerdown', close)",
    'fixture/svelte-outside.ts': "import { createOutsideClickListener } from '@uifn/core/utils/outside-click'",
    'fixture/react-focus.ts': "import { createFocusTrap } from '@uifn/core/utils/focus-trap'",
    'fixture/svelte-position.ts': "import { computePosition } from '@uifn/core/utils/position'",
    'fixture/react-lock.ts': "document.body.style.overflow = 'hidden'; const bodyScrollLockCount = 1",
    'fixture/svelte-portal.ts': "import { createPortalMount } from '@uifn/core/utils/portal'",
    'fixture/react-presence.ts': "import { detectNodeMotion } from '@uifn/core/utils/presence'",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--fixture-negative')) {
    const seeded = verifyUIFnDomPlatform(negativeFixture());
    const expected = [
      'UIFN_ROOT_LISTENER_DUPLICATE',
      'UIFN_LAYER_OUTSIDE_CLASSIFICATION',
      'UIFN_FOCUS_SCOPE_ESCAPE',
      'UIFN_POSITION_OUT_OF_BOUNDARY',
      'UIFN_SCROLL_LOCK_NESTING',
      'UIFN_PORTAL_HYDRATION_DUPLICATE',
      'UIFN_FRAMEWORK_BEHAVIOR_FORK',
    ];
    const observed = new Set(seeded.violations.map((violation) => violation.code));
    const ok = expected.every((code) => observed.has(code));
    console[ok ? 'log' : 'error'](JSON.stringify({ ...seeded, ok, expected }, null, 2));
    process.exit(ok ? 0 : 1);
  }
  const result = verifyUIFnDomPlatform();
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
