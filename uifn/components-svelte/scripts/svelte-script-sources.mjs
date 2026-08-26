import { parse as parseSvelte } from 'svelte/compiler';

export function svelteScriptSources(source) {
  const parsed = parseSvelte(source, { modern: true });
  return [parsed.instance, parsed.module]
    .filter((script) => script?.content)
    .sort((left, right) => left.content.start - right.content.start)
    .map((script) => source.slice(script.content.start, script.content.end));
}
