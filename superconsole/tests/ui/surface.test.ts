import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function sourceFiles(directory: string, extension = '.svelte'): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [path] : [];
  });
}

describe('Super Console operator surface', () => {
  it('uses UIFn Svelte components, theme mounting, and the UIFn Tailwind preset', () => {
    expect(read('src/lib/components/OperatorShell.svelte')).toContain('@uifn/components-svelte/button');
    expect(read('src/lib/components/OperatorShell.svelte')).toContain("from '@uifn/components-svelte/drawer'");
    expect(read('src/lib/components/OperatorShell.svelte')).toContain('<DrawerBackdrop />');
    expect(read('src/lib/components/OperatorShell.svelte')).not.toContain('operator-shell__scrim');
    expect(read('src/lib/components/OperatorShell.svelte')).toContain("from '@uifn/theme'");
    expect(read('tailwind.config.ts')).toContain("from '@uifn/theme-tailwind'");
    expect(read('src/routes/+layout.svelte')).toContain("@uifn/components/styles.css");
  });

  it('uses UIFn-owned compounds for every interactive primitive', () => {
    const nativeInteractiveElement = /<(?:button|input|select|textarea|dialog)(?:\s|>)/i;
    for (const file of sourceFiles(resolve(root, 'src'))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(nativeInteractiveElement);
    }
  });

  it('uses only UIFn semantic colors in console-owned CSS', () => {
    for (const file of sourceFiles(resolve(root, 'src'), '.css')) {
      const css = readFileSync(file, 'utf8');
      expect(css, file).not.toMatch(/#[\da-f]{3,8}\b/i);
      expect(css, file).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/i);
      expect(css, file).not.toContain('!important');
    }
  });

  it('does not introduce another UI toolkit or embed product-specific dashboards', () => {
    const packageJson = read('package.json');
    for (const forbidden of ['react', '@mui/', 'chakra', 'antd', 'shadcn', 'bootstrap']) {
      expect(packageJson.toLowerCase()).not.toContain(forbidden);
    }
    expect(read('src/routes/modules/[moduleId]/+page.svelte')).not.toContain('iframe');
    expect(read('src/lib/components/ResourceListPage.svelte')).not.toContain('iframe');
  });

  it('ships every permanent shell destination and explicit recovery states', () => {
    const navigation = read('src/lib/components/OperatorNavigation.svelte');
    expect(navigation).toContain("onNavigate('/search')");
    expect(navigation).toContain("onNavigate('/api')");
    expect(navigation).toContain("onNavigate('/mcp')");
    expect(read('src/lib/components/OperatorShell.svelte')).toContain('searchEnabled');
    expect(navigation).toContain("onNavigate('/settings')");
    expect(read('src/lib/components/StatePanel.svelte')).toContain("kind === 'forbidden'");
    expect(read('src/lib/components/OperatorShell.svelte')).toContain('Loading the next operator view');
    expect(read('src/routes/sign-in/+page.svelte')).toContain('/api/admin/v1/auth/sign-in');
    expect(read('src/routes/sign-in/+page.svelte')).toContain("body?.error?.code === 'OPERATOR_2FA_REQUIRED'");
    expect(read('src/routes/sign-in/+page.svelte')).toContain('/api/admin/v1/auth/2fa');
    expect(read('src/routes/sign-in/+page.svelte')).toContain('autocomplete="one-time-code"');
    expect(read('src/routes/sign-in/+page.svelte')).toContain('Back to password');
    expect(read('src/routes/sign-in/+page.svelte')).not.toContain('localStorage');
  });

  it('uses issued confirmations and stable idempotency controls for mutations', () => {
    const action = read('src/lib/components/ActionButton.svelte');
    expect(action).toContain("scopedConsoleHref('/api/admin/v1/confirmations'");
    expect(action).toContain('crypto.randomUUID()');
    expect(action).toContain("headers.set('idempotency-key', stableIdempotencyKey(input))");
    expect(action).toContain("headers.set('x-admin-confirmation', token)");
    expect(action).toContain('JSON.stringify(input)');
    expect(action).toContain('@uifn/components-svelte/textarea');
    expect(action).toContain('validateActionInput(action, draft)');
    expect(action).toContain('materializeAdminActionHref(endpoint, input, method)');
    expect(action).toContain('auditId ? `Audit ${auditId}`');
    expect(action).toContain('requestId ? `Request ${requestId}`');
    expect(action).toContain('refreshSuccessfulMutation(successMessage, invalidateAll)');
    expect(action).toContain("action.id.endsWith('.download')");
    expect(action).toContain('openSafeAdminDownloadReceipt(receipt)');
  });

  it('scopes settings mutations with a stable key per desired state', () => {
    const settings = read('src/routes/settings/+page.svelte');
    expect(settings).toContain('const intentKeys = new Map<string, string>()');
    expect(settings).toContain('scope: page.url.searchParams');
    expect(settings).toContain('intentKeys.delete(intent)');
    expect(settings).toContain('refreshSuccessfulMutation(`${policy.label} updated.`, invalidateAll)');
  });

  it('mounts owned child resources through generic source-module projection', () => {
    expect(read('src/lib/components/resource-pages.ts')).toContain('resource.sourceModuleId ?? input.moduleId');
    expect(read('src/lib/server/super-console.ts')).toContain("encodeURIComponent(`${child.id}:${resource.resourceId}`)");
    expect(read('src/routes/modules/[moduleId]/+page.svelte')).toContain('as resource (resource.href)');
  });

  it('renders declared resource presentation before generic inference', () => {
    const pages = read('src/lib/components/resource-pages.ts');
    expect(pages).toContain('resource.presentation?.columns?.length');
    expect(pages).toContain('presentation?.titleField');
    expect(pages).toContain('presentation?.statusField');
  });

  it('preserves scope in generic inspection and aligns command search with visible labels', () => {
    const resources = read('src/lib/components/resource-pages.ts');
    expect(resources).toContain('withAdminScope(');
    const command = read('src/lib/components/CommandPalette.svelte');
    expect(command).toContain('commandValue(command)');
    expect(command).toContain('onValueChange');
  });

  it('renders registry and module failures before empty resource states', () => {
    expect(read('src/routes/+page.svelte')).toContain("data.shell.error?.status === 403");
    expect(read('src/routes/+page.svelte')).toContain('<StatePanel kind="error" error={data.shell.error}');
    expect(read('src/routes/modules/[moduleId]/+page.svelte')).toContain('<StatePanel kind="error" error={data.loadError}');
    expect(read('src/lib/components/ResourceListPage.svelte')).toContain("url.searchParams.delete('cursor')");
  });
});
