import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocsRootLayout, createBaseLayoutOptions } from '@superfunctions/docs-theme';

const gitConfig = { user: '21nCo', repo: 'super-functions', branch: 'dev' };

test('base options expose the default navigation and repository branch URL', () => {
  assert.deepEqual(createBaseLayoutOptions('Superfunctions', gitConfig), {
    nav: { title: 'Superfunctions', url: '/docs' },
    githubUrl: 'https://github.com/21nCo/super-functions/tree/dev',
  });
});

test('custom navigation and reserved branch characters preserve the public URL contract', () => {
  const options = createBaseLayoutOptions('API & Guides', {
    ...gitConfig,
    branch: 'release/docs #1?preview=true',
  }, '/reference');
  assert.deepEqual(options, {
    nav: { title: 'API & Guides', url: '/reference' },
    githubUrl: 'https://github.com/21nCo/super-functions/tree/release%2Fdocs%20%231%3Fpreview%3Dtrue',
  });
  assert.deepEqual(gitConfig, { user: '21nCo', repo: 'super-functions', branch: 'dev' });
});

test('base layout results do not share mutable navigation objects', () => {
  const first = createBaseLayoutOptions('First', gitConfig);
  first.nav.title = 'Changed';
  first.nav.url = '/changed';
  assert.deepEqual(createBaseLayoutOptions('Second', gitConfig).nav, {
    title: 'Second', url: '/docs',
  });
});

test('root layout renders its default language, body class, font and nested content', () => {
  const html = renderToStaticMarkup(createElement(DocsRootLayout, null,
    createElement('main', { id: 'content' }, 'Docs <safe> & useful'),
  ));
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<body class="flex min-h-screen flex-col"/);
  assert.match(html, /font-family:Twenty One Native, system-ui, -apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, Roboto, sans-serif/);
  assert.match(html, /<main id="content">Docs &lt;safe&gt; &amp; useful<\/main>/);
  assert.doesNotMatch(html, /suppressHydrationWarning/);
});

test('root layout forwards language and body overrides without mutating caller style', () => {
  const bodyStyle = Object.freeze({ fontFamily: 'Custom Font', backgroundColor: 'navy', marginTop: 12 });
  const html = renderToStaticMarkup(createElement(DocsRootLayout, {
    lang: 'fr',
    bodyClassName: 'custom-body',
    bodyStyle,
  }, createElement('span', null, 'Bonjour')));
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /<body class="custom-body" style="font-family:Custom Font;background-color:navy;margin-top:12px">/);
  assert.match(html, /<span>Bonjour<\/span>/);
  assert.deepEqual(bodyStyle, { fontFamily: 'Custom Font', backgroundColor: 'navy', marginTop: 12 });
});

test('additional body styles retain the default font and an explicit empty class is honored', () => {
  const html = renderToStaticMarkup(createElement(DocsRootLayout, {
    bodyClassName: '',
    bodyStyle: { color: 'red' },
  }, null));
  assert.match(html, /<body class=""/);
  assert.match(html, /font-family:Twenty One Native/);
  assert.match(html, /;color:red/);
});
