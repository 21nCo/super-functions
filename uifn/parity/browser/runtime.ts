import type manifest from '../../.conduct/generated/phase-14/phase-14-public-vectors.json';

type Vector = (typeof manifest.vectors)[number];

export async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

export function assertPhase14Checkpoints(vector: Vector, checkpoints: Array<{ parts: { checkpoint: string; parts: Array<{ part: string }> } }>): void {
  const expected = vector.anatomy.map((part) => part.id).sort();
  for (const checkpoint of checkpoints) {
    const actual = checkpoint.parts.parts.map((part) => part.part).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${vector.primitive}:${checkpoint.parts.checkpoint} exposed ${actual.length}/${expected.length} exact anatomy parts.`);
    }
  }
}

export function assertUniqueIds(vector: Vector): void {
  const ids = Array.from(document.querySelectorAll<HTMLElement>('[id]')).map((element) => element.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${vector.primitive} rendered duplicate IDs in a real browser.`);
}

export function browserTraceEnvironment(): Record<string, string> {
  return {
    runtime: 'browser',
    runtimeVersion: navigator.userAgent,
    browser: navigator.userAgent,
    browserVersion: navigator.userAgent,
    os: navigator.platform,
    direction: getComputedStyle(document.documentElement).direction,
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function removeHarnessDom(): void {
  document.body.replaceChildren();
  document.querySelectorAll('[inert]').forEach((element) => element.removeAttribute('inert'));
}
