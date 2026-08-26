import * as React from 'react';
import { addons, types, useParameter } from 'storybook/manager-api';

const ADDON_ID = '@uifn/storybook';
const PANEL_ID = `${ADDON_ID}/compatibility`;

function CompatibilityPanel(): React.ReactElement {
  const value = useParameter<Record<string, unknown>>('uifnCompatibility', {});
  return React.createElement('section', { style: { padding: 16, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap' }, 'data-uifn-compatibility-panel': '' },
    React.createElement('h2', null, 'uifn compatibility'),
    React.createElement('pre', null, JSON.stringify(value, null, 2)),
  );
}

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: 'uifn compatibility',
    match: ({ viewMode }) => viewMode === 'story',
    render: ({ active }) => active ? React.createElement(CompatibilityPanel) : null,
  });
});
