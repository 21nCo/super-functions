import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import * as sendfnCore from '../src';
import { sendfn } from '../src';
import { apnsAdapter } from '../src/push/apns';
import { fcmAdapter } from '../src/push/fcm';
import { metaWhatsAppAdapter } from '../src/whatsapp/meta-cloud-adapter';

describe('TypeScript package baseline', () => {
  it('exports the public factory', () => {
    expect(typeof sendfn).toBe('function');
  });

  it('keeps adapter factories out of the core export surface', () => {
    expect(typeof metaWhatsAppAdapter).toBe('function');
    expect(typeof apnsAdapter).toBe('function');
    expect(typeof fcmAdapter).toBe('function');
    expect('metaWhatsAppAdapter' in sendfnCore).toBe(false);
    expect('apnsAdapter' in sendfnCore).toBe(false);
    expect('fcmAdapter' in sendfnCore).toBe(false);
  });

  it('keeps the package manifest aligned with the public package name', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );

    expect(packageJson.name).toBe('sendfn');
  });

  it('publishes the edge entrypoint used by Worker consumers', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );

    expect(packageJson.exports?.['./edge']).toMatchObject({
      types: './dist/edge.d.ts',
      import: './dist/edge.mjs',
      require: './dist/edge.js',
    });
  });

  it('publishes provider adapters through direct subpath entrypoints', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );

    expect(packageJson.exports?.['./adapters/meta-whatsapp']).toMatchObject({
      types: './dist/adapters/meta-whatsapp.d.ts',
      import: './dist/adapters/meta-whatsapp.mjs',
      require: './dist/adapters/meta-whatsapp.js',
    });
    expect(packageJson.exports?.['./adapters/apns']).toBeDefined();
    expect(packageJson.exports?.['./adapters/fcm']).toBeDefined();
  });

  it('documents the shipped install and import instructions', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

    expect(readme).toContain('npm install sendfn @superfunctions/db @superfunctions/http');
    expect(readme).toContain("import { sendfn, awsSesAdapter, consoleSmsAdapter } from 'sendfn';");
    expect(readme).toContain("import { apnsAdapter } from 'sendfn/adapters/apns';");
    expect(readme).toContain("import { metaWhatsAppAdapter } from 'sendfn/adapters/meta-whatsapp';");
    expect(readme).toContain('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required');
    expect(readme).not.toContain('@sendfn/core');
  });
});
