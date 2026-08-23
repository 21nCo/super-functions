import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyUIFnDomPlatform } from './verify-uifn-dom-platform.mjs';

test('production framework sources bind DOM behavior through @uifn/dom', () => {
  const result = verifyUIFnDomPlatform();
  assert.equal(result.ok, true, JSON.stringify(result.violations, null, 2));
});

test('controlled framework forks fail with the intended DOM codes', () => {
  const result = verifyUIFnDomPlatform({
    'listener.ts': "document.addEventListener('pointerdown', close)",
    'outside.ts': "import { createOutsideClickListener } from '@uifn/core/utils/outside-click'",
    'focus.ts': "createFocusTrap(node)",
    'position.ts': "import { computePosition } from '@uifn/core/utils/position'",
    'scroll.ts': "document.body.style.overflow = 'hidden'",
    'portal.ts': "createPortalMount(node)",
    'presence.ts': "detectNodeMotion(node)",
  });
  assert.equal(result.ok, false);
  const codes = new Set(result.violations.map((violation) => violation.code));
  for (const code of [
    'UIFN_ROOT_LISTENER_DUPLICATE',
    'UIFN_LAYER_OUTSIDE_CLASSIFICATION',
    'UIFN_FOCUS_SCOPE_ESCAPE',
    'UIFN_POSITION_OUT_OF_BOUNDARY',
    'UIFN_SCROLL_LOCK_NESTING',
    'UIFN_PORTAL_HYDRATION_DUPLICATE',
    'UIFN_FRAMEWORK_BEHAVIOR_FORK',
  ]) assert.equal(codes.has(code), true, `missing ${code}`);
});
