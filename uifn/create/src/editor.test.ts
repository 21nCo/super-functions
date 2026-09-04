import { describe, expect, it } from 'vitest';
import { PRESET_AXES, PRESET_FIELD_ORDER, compilePreset, encodePreset, presetFromUrl } from '@uifn/registry/preset';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('create editor contract', () => {
  it('derives every control from the canonical preset axes', () => {
    const source = readFileSync(path.join(__dirname, 'main.ts'), 'utf8');
    for (const axis of PRESET_FIELD_ORDER) {
      expect(source).toContain('PRESET_FIELD_ORDER');
      expect(PRESET_AXES[axis].length).toBeGreaterThan(1);
    }
  });

  it('shares encode/URL/compile with CLI', () => {
    const preset = { style: 'atlas', radius: 'sm' } as const;
    const plan = compilePreset({
      version: 1,
      style: 'atlas',
      baseColor: 'zinc',
      theme: 'default',
      chartColor: 'spectrum',
      font: 'inter',
      headingFont: 'inherit',
      iconLibrary: 'lucide',
      radius: 'sm',
      density: 'comfortable',
      menuTreatment: 'elevated',
      framework: 'react',
      installMode: 'package',
    });
    expect(plan.commands.init).toContain(encodePreset(preset));
    expect(presetFromUrl(plan.url).style).toBe('atlas');
  });
});
