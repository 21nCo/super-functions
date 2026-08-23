import { renderToString } from 'solid-js/web';
import { describe, expect, it } from 'vitest';
import catalog from '../../../catalog/generated/catalog.json';
import { Accordion } from '../index.js';
import { AllRootsHarness } from './fixtures/AllRootsHarness.jsx';

describe('TV-SOLID-001-P: Solid SSR source contract', () => {
  it('server-renders all public roots through the native Solid compiler', () => {
    const html = renderToString(() => <AllRootsHarness />);
    for (const primitive of catalog.primitives) expect(html).toContain(`data-testid="${primitive.id}-root"`);
    expect(html).not.toContain('React.createElement');
  });

  it('emits deterministic controller IDs and semantic state', () => {
    const render = () => renderToString(() => (
      <Accordion.Root type="multiple" value={[]}>
        <Accordion.Item value="one">
          <Accordion.Header value="one">
            <Accordion.Trigger value="one">First section</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content value="one">First content</Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    ));
    const first = render();
    const second = render();
    expect(first).toBe(second);
    expect(first).toContain('aria-expanded="false"');
    expect(first).toContain('First section');
    expect(first).not.toContain(' type="multiple"');
    expect(first).not.toContain(' value=""');
  });
});
