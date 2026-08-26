import { describe, expect, it } from 'vitest';
import { patternModelHtml } from '../workbench-model';

describe('workbench model HTML', () => {
  it('escapes status-derived attributes and copy at the HTML boundary', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const html = patternModelHtml({
      family: 'pattern',
      slug: 'safe',
      name: 'Safe',
      status: payload as never,
      itemCount: 0,
      callbacks: [],
    });
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
