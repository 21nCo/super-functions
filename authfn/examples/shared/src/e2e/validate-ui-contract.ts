import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_TEST_IDS } from '../client/testids.js';

type ExampleTestIdKey = keyof typeof EXAMPLE_TEST_IDS;

interface ExampleUiContract {
  name: string;
  clientFile: string;
  specFile: string;
  requiredIds: ExampleTestIdKey[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesRoot = path.resolve(__dirname, '../../..');

const EXAMPLE_UI_CONTRACTS: ExampleUiContract[] = [
  {
    name: 'password-sessions',
    clientFile: path.join(examplesRoot, 'password-sessions/client/src/App.svelte'),
    specFile: path.join(examplesRoot, 'password-sessions/e2e/password-sessions.spec.ts'),
    requiredIds: ['exampleTitle', 'signUpForm', 'signInForm', 'authStatePanel', 'eventLogPanel']
  },
  {
    name: 'otp-recovery',
    clientFile: path.join(examplesRoot, 'otp-recovery/client/src/App.svelte'),
    specFile: path.join(examplesRoot, 'otp-recovery/e2e/otp-recovery.spec.ts'),
    requiredIds: ['exampleTitle', 'signUpForm', 'otpInboxPanel', 'authStatePanel', 'eventLogPanel']
  },
  {
    name: 'social-oauth',
    clientFile: path.join(examplesRoot, 'social-oauth/client/src/App.svelte'),
    specFile: path.join(examplesRoot, 'social-oauth/e2e/social-oauth.spec.ts'),
    requiredIds: ['exampleTitle', 'socialGoogleButton', 'authStatePanel', 'eventLogPanel']
  },
  {
    name: 'account-settings',
    clientFile: path.join(examplesRoot, 'account-settings/client/src/App.svelte'),
    specFile: path.join(examplesRoot, 'account-settings/e2e/account-settings.spec.ts'),
    requiredIds: ['exampleTitle', 'signUpForm', 'twoFactorEnrollButton', 'authStatePanel', 'eventLogPanel']
  },
  {
    name: 'multi-region-routing',
    clientFile: path.join(examplesRoot, 'multi-region-routing/client/src/App.svelte'),
    specFile: path.join(examplesRoot, 'multi-region-routing/e2e/multi-region-routing.spec.ts'),
    requiredIds: ['exampleTitle', 'regionLookupForm', 'authStatePanel', 'eventLogPanel']
  }
];

const TEST_VECTOR_SELECTOR_KEYS: ExampleTestIdKey[] = [
  'exampleTitle',
  'authStatePanel',
  'eventLogPanel',
  'signUpForm',
  'otpInboxPanel',
  'socialGoogleButton',
  'twoFactorEnrollButton',
  'regionLookupForm'
];

const helpersFile = path.join(examplesRoot, 'shared/src/e2e/helpers.ts');
const demoRoutesFile = path.join(examplesRoot, 'shared/src/server/demo-routes.ts');

void main().catch((error: unknown) => {
  reportFailure(error);
});

async function main(): Promise<void> {
  const knownKeys = new Set<ExampleTestIdKey>(Object.keys(EXAMPLE_TEST_IDS) as ExampleTestIdKey[]);
  const presentSelectorKeys = new Set<ExampleTestIdKey>();

  for (const contract of EXAMPLE_UI_CONTRACTS) {
    const clientSource = readRequiredFile(contract.clientFile);
    const specSource = readRequiredFile(contract.specFile);

    for (const selectorKey of contract.requiredIds) {
      ensureKnownSelectorKey(selectorKey, knownKeys);
      ensureClientUsesSelector(contract.name, contract.clientFile, clientSource, selectorKey);
      presentSelectorKeys.add(selectorKey);
    }

    for (const selectorKey of collectSpecSelectorKeys(specSource)) {
      ensureKnownSelectorKey(selectorKey, knownKeys);
      ensureClientUsesSelector(contract.name, contract.clientFile, clientSource, selectorKey);
      presentSelectorKeys.add(selectorKey);
    }
  }

  for (const selectorKey of TEST_VECTOR_SELECTOR_KEYS) {
    if (!presentSelectorKeys.has(selectorKey)) {
      failUiContract(
        `Documented selector ${EXAMPLE_TEST_IDS[selectorKey]} is missing from the example portfolio`,
        {
          selectorKey,
          selector: EXAMPLE_TEST_IDS[selectorKey]
        }
      );
    }
  }

  const helpersSource = readRequiredFile(helpersFile);
  ensureContains(helpersFile, helpersSource, 'resetDemoScenario');
  ensureContains(helpersFile, helpersSource, 'getDemoEvents');
  ensureContains(helpersFile, helpersSource, 'getLatestDemoOtp');

  const demoRoutesSource = readRequiredFile(demoRoutesFile);
  ensureContains(demoRoutesFile, demoRoutesSource, "path: '/reset'");
  ensureContains(demoRoutesFile, demoRoutesSource, "path: '/events'");
  ensureContains(demoRoutesFile, demoRoutesSource, "path: '/otp/latest'");

  console.log(JSON.stringify({
    status: 'pass',
    assertions: {
      allSelectorsPresent: true,
      demoRoutesReachable: true
    }
  }, null, 2));
}

function collectSpecSelectorKeys(source: string): ExampleTestIdKey[] {
  const matches = source.matchAll(/ids\.([A-Za-z0-9_]+)/g);
  const keys = new Set<ExampleTestIdKey>();

  for (const match of matches) {
    const selectorKey = match[1] as ExampleTestIdKey;
    keys.add(selectorKey);
  }

  return [...keys];
}

function ensureKnownSelectorKey(
  selectorKey: string,
  knownKeys: Set<ExampleTestIdKey>
): asserts selectorKey is ExampleTestIdKey {
  if (!knownKeys.has(selectorKey as ExampleTestIdKey)) {
    failUiContract(`Unknown documented selector key: ${selectorKey}`, {
      selectorKey
    });
  }
}

function ensureClientUsesSelector(
  exampleName: string,
  clientFile: string,
  clientSource: string,
  selectorKey: ExampleTestIdKey
): void {
  const snippet = `EXAMPLE_TEST_IDS.${selectorKey}`;
  if (!clientSource.includes(snippet)) {
    failUiContract(
      `Example ${exampleName} is missing documented selector ${EXAMPLE_TEST_IDS[selectorKey]}`,
      {
        exampleName,
        clientFile,
        selectorKey,
        selector: EXAMPLE_TEST_IDS[selectorKey]
      }
    );
  }
}

function ensureContains(filePath: string, source: string, snippet: string): void {
  if (!source.includes(snippet)) {
    failUiContract(`Missing shared UI contract snippet: ${snippet}`, {
      filePath,
      snippet
    });
  }
}

function readRequiredFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    failUiContract('Required UI contract file is missing', {
      filePath
    });
  }

  return fs.readFileSync(filePath, 'utf-8');
}

function failUiContract(message: string, details?: Record<string, unknown>): never {
  const error = new Error(message) as Error & {
    code: 'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING';
    details?: Record<string, unknown>;
  };
  error.code = 'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING';
  error.details = details;
  throw error;
}

function reportFailure(error: unknown): never {
  const normalized = normalizeFailure(error);
  console.error(JSON.stringify({
    status: 'fail',
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details
    }
  }, null, 2));
  process.exit(1);
}

function normalizeFailure(error: unknown): {
  code: 'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING';
  message: string;
  details?: Record<string, unknown>;
} {
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING'
  ) {
    return {
      code: 'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING',
      message: error instanceof Error ? error.message : 'UI contract validation failed',
      details: 'details' in error && error.details && typeof error.details === 'object'
        ? error.details as Record<string, unknown>
        : undefined
    };
  }

  return {
    code: 'AUTHFN_EXAMPLE_UI_CONTRACT_MISSING',
    message: error instanceof Error ? error.message : 'UI contract validation failed'
  };
}
