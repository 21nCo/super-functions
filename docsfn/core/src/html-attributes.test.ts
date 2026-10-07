import { expect, it } from "vitest";
import { mapHtmlAttributes } from "./html-attributes";

it.each(["\u00a0", "\u2003", "\u000b"])("keeps non-HTML whitespace inside unquoted values: %j", whitespace => {
  const attributes: Array<[string, string]> = [];
  mapHtmlAttributes(`<a href=/docs${whitespace}guide title=Page>`, (name, value, raw) => {
    attributes.push([name, value]);
    return raw;
  });
  expect(attributes).toEqual([["href", `/docs${whitespace}guide`], ["title", "Page"]]);
});

it("keeps non-HTML whitespace in attribute names rather than inventing a handler", () => {
  const names: string[] = [];
  mapHtmlAttributes('<img \u00a0onerror="text">', (name, _value, raw) => {
    names.push(name);
    return raw;
  });
  expect(names).toEqual(["\u00a0onerror"]);
});

it("preserves attribute boundaries after removing boolean and slash-prefixed handlers", () => {
  const removeEvents = (name: string, _value: string, raw: string) => name.startsWith("on") ? "" : raw;
  expect(mapHtmlAttributes('<a onload href="/safe" title=">">text /onload=x</a>', removeEvents)).toBe('<a href="/safe" title=">">text /onload=x</a>');
  expect(mapHtmlAttributes('<svg/onload=alert(1)>', removeEvents)).toBe('<svg>');
});
it("scans repeated unmatched tag prefixes without changing them", () => {
  const text = "<a".repeat(50_000);
  expect(mapHtmlAttributes(text, (_name, _value, raw) => raw)).toBe(text);
});

it("skips complete and unterminated HTML comments", () => {
  const drop = () => '';
  expect(mapHtmlAttributes('<!-- <a onclick="demo()"> -->', drop)).toBe('<!-- <a onclick="demo()"> -->');
  expect(mapHtmlAttributes('<!-- <a onclick="demo()">', drop)).toBe('<!-- <a onclick="demo()">');
});

it.each(['<!-->', '<!--->', '<!-- --!>'])('sanitizes attributes after browser-recognized comment terminators %s', prefix => {
  expect(mapHtmlAttributes(prefix + '<img onerror="attack()">', (name, _value, raw) => name.startsWith('on') ? '' : raw)).toBe(prefix + '<img>');
});
it('scans many ordinary comments without repeatedly searching the remaining suffix', () => {
  const source = '<!-- safe -->'.repeat(50000);
  expect(mapHtmlAttributes(source, (_name, _value, raw) => raw)).toBe(source);
});
