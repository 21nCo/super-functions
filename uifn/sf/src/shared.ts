import type { PatternName, PatternRenderModel, PatternStatus } from '@uifn/patterns';

export interface SfPatternModel<TData = unknown> extends PatternRenderModel<TData> {
  superfunction: 'authfn' | 'plugfn' | 'filefn' | 'billfn';
  controlledCounterpart: PatternName;
  clientContract: string;
  usesInjectedClient: true;
  mockable: true;
  forbiddenReads: [];
}

export interface SfPatternOptions<TClient, TData = unknown> {
  client: TClient;
  status?: PatternStatus;
  data?: TData;
  error?: { code: string; message: string } | null;
}

export function withSuperfunctionBacking<TData>(
  model: PatternRenderModel<TData>,
  metadata: Pick<SfPatternModel<TData>, 'superfunction' | 'controlledCounterpart' | 'clientContract'>
): SfPatternModel<TData> {
  return {
    ...model,
    ...metadata,
    usesInjectedClient: true,
    mockable: true,
    forbiddenReads: [],
  };
}

export async function resolveBackedData<TData>(
  status: PatternStatus | undefined,
  providedData: TData | undefined,
  load: () => Promise<TData>
): Promise<{ status: PatternStatus; data: TData | undefined; error: null | { code: string; message: string } }> {
  let loadedData: TData | undefined;
  let loadFailed = false;

  if (providedData === undefined) {
    try {
      loadedData = await load();
    } catch {
      loadFailed = true;
    }
  }

  if (status && status !== 'success') {
    return {
      status,
      data: providedData ?? loadedData,
      error: status === 'error' ? { code: 'UIFN_SF_CLIENT_ERROR', message: 'Injected client returned an error state.' } : null,
    };
  }

  if (loadFailed) {
    return {
      status: 'error',
      data: providedData,
      error: { code: 'UIFN_SF_CLIENT_ERROR', message: 'Injected client call failed.' },
    };
  }

  const data = providedData ?? loadedData;
  const empty = Array.isArray(data) ? data.length === 0 : !data;

  return {
    status: empty ? 'empty' : 'success',
    data,
    error: null,
  };
}

export interface RedactedLog {
  [key: string]: unknown;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LOCAL_PATH_PATTERN = /^(\/Users\/|\/home\/|[A-Za-z]:\\)/;
const SECRET_KEY_PATTERN = /(token|secret|password|apiKey|uploadUrl)/i;

export function redactSecretLog(input: RedactedLog): RedactedLog {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      if (SECRET_KEY_PATTERN.test(key)) {
        return [key, '[REDACTED]'];
      }

      if (typeof value === 'string' && LOCAL_PATH_PATTERN.test(value)) {
        return [key, '[REDACTED_LOCAL_PATH]'];
      }

      if (typeof value === 'string' && EMAIL_PATTERN.test(value)) {
        return [key, '[REDACTED_PII]'];
      }

      return [key, value];
    })
  );
}
