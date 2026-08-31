import { describe, expect, it } from 'vitest';
import { TemplateError } from '../src';
import { TemplateEngine } from '../src/templates/engine';

describe('TemplateEngine', () => {
  it('renders variables, conditionals, and loops deterministically with escaping', () => {
    const engine = new TemplateEngine();

    const rendered = engine.render(
      '<ul>{{#each items}}<li>{{name}}</li>{{/each}}</ul>{{#if cta}}<a href="{{cta}}">Go</a>{{/if}}',
      {
        items: [{ name: '<Alice>' }, { name: 'Bob' }],
        cta: 'https://example.com',
      }
    );

    expect(rendered).toBe(
      '<ul><li>&lt;Alice&gt;</li><li>Bob</li></ul><a href="https://example.com">Go</a>'
    );
  });

  it('leaves subject and plain-text variables unescaped when requested', () => {
    const engine = new TemplateEngine();
    const data = { name: 'A&B', url: 'https://example.com/reset?a=1&b=2' };

    expect(engine.render('{{name}}: {{url}}', data, { escapeHtml: false }))
      .toBe('A&B: https://example.com/reset?a=1&b=2');
    expect(engine.render('<a href="{{url}}">{{name}}</a>', data))
      .toBe('<a href="https://example.com/reset?a=1&amp;b=2">A&amp;B</a>');
  });

  it('rejects malformed block syntax with a stable template render error', () => {
    const engine = new TemplateEngine();

    expect(() => engine.render('{{#if missing}}A{{/each}}', {})).toThrowError(TemplateError);

    try {
      engine.render('{{#if missing}}A{{/each}}', {});
    } catch (error) {
      expect(error).toMatchObject({
        code: 'SENDFN_TEMPLATE_RENDER_ERROR',
        message: 'Malformed template block syntax',
      });
    }
  });
});
