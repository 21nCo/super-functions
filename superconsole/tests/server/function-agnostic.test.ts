import { describe, expect, it } from 'vitest';
// The production guard is an executable ESM module with an exported pure analyzer.
import { findFunctionAgnosticIssues } from '../../scripts/verify-function-agnostic.mjs';

describe('function-agnostic source guard', () => {
  it('checks code identifiers and module imports without scanning comments or strings', () => {
    const findings = findFunctionAgnosticIssues(`
      // AuthFnConfig and MODULE_CATALOG in a comment are inert.
      const prose = 'searchFnService and KNOWN_MODULE_IDS in a string';
      const saveFn = () => prose;
      const saveFnHandler = saveFn;
      type AuthFnConfig = { enabled: boolean };
      const searchFnService = {};
      const MODULE_CATALOG = {};
      import provider from 'authfn';
    `, 'fixture.ts');

    expect(findings).toEqual(expect.arrayContaining([
      expect.stringContaining('concrete function identifier AuthFnConfig'),
      expect.stringContaining('concrete function identifier searchFnService'),
      expect.stringContaining('fixed catalog symbol MODULE_CATALOG'),
      expect.stringContaining('concrete function package import authfn'),
    ]));
    expect(findings.join('\n')).not.toContain('saveFn');
  });

  it('parses Svelte script blocks and permits declared infrastructure dependencies', () => {
    expect(findFunctionAgnosticIssues(`
      <script lang="ts">
        import { ButtonRoot as UIFnButton } from '@uifn/components-svelte/button';
        import type { Tool } from '@mcpfn/core';
        import { client } from 'searchfn';
      </script>
      <p>AuthFnConfig is presentation text.</p>
    `, 'fixture.svelte')).toEqual([
      expect.stringContaining('concrete function package import searchfn'),
    ]);
  });

  it('requires a real closing script tag and preserves offsets after Unicode case expansions', () => {
    const findings = findFunctionAgnosticIssues(`İ
      <script lang="ts">
        const inert = '</scriptx>';
        import { client } from 'searchfn';
      </script   >
    `, 'fixture.svelte');
    expect(findings).toEqual([expect.stringContaining('concrete function package import searchfn')]);
    expect(findings[0]).toMatch(/^4:/);
  });
});
