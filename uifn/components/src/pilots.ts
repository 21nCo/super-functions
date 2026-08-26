export const STYLED_PILOT_DEMOS = {
  button: ['default', 'variant-secondary', 'variant-outline', 'variant-ghost', 'variant-danger', 'variant-danger-outline', 'variant-link', 'size-sm', 'size-lg', 'icon-sm', 'icon-md', 'icon-lg', 'loading', 'disabled'],
  field: ['default', 'invalid', 'disabled', 'read-only', 'density-compact'],
  input: ['default', 'invalid', 'disabled', 'read-only', 'size-sm', 'size-lg'],
  checkbox: ['unchecked', 'checked', 'mixed', 'invalid', 'disabled'],
  switch: ['unchecked', 'checked', 'disabled', 'density-compact'],
  select: ['default', 'open', 'invalid', 'disabled', 'size-lg'],
  combobox: ['default', 'open', 'invalid', 'disabled', 'loading'],
  dialog: ['default', 'open', 'disabled'],
  menu: ['default', 'open', 'disabled'],
  tabs: ['default', 'selected', 'disabled', 'density-compact'],
  card: ['default', 'elevated', 'variant-outline', 'density-spacious'],
  table: ['default', 'striped', 'density-compact', 'density-spacious'],
} as const;

export type StyledPilotName = keyof typeof STYLED_PILOT_DEMOS;

export function getStyledPilotDemo(component: string): readonly string[] | undefined {
  return STYLED_PILOT_DEMOS[component as StyledPilotName];
}
