import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBaseLayoutOptions } from '@superfunctions/docs-theme';

const gitConfig = { user: '21nCo', repo: 'super-functions', branch: 'dev' };


test('custom navigation and reserved branch characters preserve the public URL contract', () => {
  const options = createBaseLayoutOptions('API & Guides', {
    ...gitConfig,
    branch: 'release/docs #1?preview=true',
  }, '/reference');
  assert.deepEqual(options, {
    nav: { title: 'API & Guides', url: '/reference' },
    githubUrl: 'https://github.com/21nCo/super-functions/tree/release%2Fdocs%20%231%3Fpreview%3Dtrue',
  });
});

test('base layout results do not share mutable navigation objects', () => {
  const first = createBaseLayoutOptions('First', gitConfig);
  first.nav.title = 'Changed';
  first.nav.url = '/changed';
  assert.deepEqual(createBaseLayoutOptions('Second', gitConfig).nav, {
    title: 'Second', url: '/docs',
  });
});
