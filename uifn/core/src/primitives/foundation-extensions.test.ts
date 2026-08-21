import { describe, expect, it, vi } from 'vitest';
import {
  BadgeContract,
  BreadcrumbContract,
  CardContract,
  createCommandController,
  InputGroupContract,
  SkeletonContract,
  TableContract,
  TextareaContract,
} from './index';

describe('extended component foundations', () => {
  it('projects semantic static contracts without browser behavior', () => {
    expect(BadgeContract.getParts({ variant: 'success' }, { scopeId: 'badge-a' }).root.data).toMatchObject({
      state: 'idle',
      variant: 'success',
    });
    expect(BreadcrumbContract.getParts({}, { scopeId: 'crumb-a' }).page.aria).toMatchObject({
      current: 'page',
    });
    expect(CardContract.getParts({ elevated: true }, { scopeId: 'card-a' }).root.data).toMatchObject({
      elevated: true,
    });
    expect(CardContract.getParts({ elevated: true }, { scopeId: 'card-a' }).root.aria).toBeUndefined();
    expect(InputGroupContract.getParts({ invalid: true }, { scopeId: 'group-a' }).input.aria).toMatchObject({
      invalid: true,
    });
    expect(SkeletonContract.getParts({}, { scopeId: 'skeleton-a' }).root.aria).toMatchObject({
      hidden: true,
    });
    expect(TableContract.getParts({ striped: true }, { scopeId: 'table-a' }).head('name').attributes).toMatchObject({
      scope: 'col',
    });
    expect(TextareaContract.getParts({ invalid: true }, { scopeId: 'textarea-a' }).root).toMatchObject({
      aria: { invalid: true },
      data: { state: 'invalid', resize: 'vertical' },
    });
  });

  it('keys every repeated static part ID by its consumer value', () => {
    const breadcrumb = BreadcrumbContract.getParts({}, { scopeId: 'crumb-a' });
    const inputGroup = InputGroupContract.getParts({}, { scopeId: 'group-a' });
    const table = TableContract.getParts({}, { scopeId: 'table-a' });

    expect(breadcrumb.item('workspace').id).not.toBe(breadcrumb.item('settings').id);
    expect(breadcrumb.link('workspace').id).not.toBe(breadcrumb.link('projects').id);
    expect(breadcrumb.separator(0).id).not.toBe(breadcrumb.separator(1).id);
    expect(inputGroup.addon('prefix').id).not.toBe(inputGroup.addon('suffix').id);
    expect(inputGroup.text('prefix').id).not.toBe(inputGroup.text('suffix').id);
    expect(inputGroup.button('copy').id).not.toBe(inputGroup.button('clear').id);
    expect(table.row('header').id).not.toBe(table.row('project-1').id);
    expect(table.head('name').id).not.toBe(table.head('status').id);
    expect(table.cell('project-1-name').id).not.toBe(table.cell('project-2-name').id);
  });

  it('provides a keyboard-driven command selection controller', () => {
    const onValueChange = vi.fn();
    const command = createCommandController({
      placeholder: 'Type a command or search…',
      items: [
        { value: 'open', label: 'Open file' },
        { value: 'search', label: 'Search workspace' },
      ],
      onValueChange,
    });

    expect(command.state.open).toBe(true);
    expect(command.parts.input.getProps().attributes?.placeholder).toBe('Type a command or search…');
    command.update({ placeholder: 'Search workspace…' });
    expect(command.parts.input.getProps().attributes?.placeholder).toBe('Search workspace…');
    command.parts.input.getProps().on?.input?.({ type: 'input', value: 'search' });
    expect(command.state.inputValue).toBe('search');
    expect(command.parts.item.getProps('open').hidden).toBe(true);
    expect(command.parts.item.getProps('search').hidden).toBe(false);
    command.parts.input.getProps().on?.keydown?.({ type: 'keydown', key: 'ArrowDown' });
    expect(command.state.highlightedItem).toBe('search');
    command.parts.input.getProps().on?.keydown?.({ type: 'keydown', key: 'Enter' });
    expect(command.state.value).toBe('search');
    expect(onValueChange).toHaveBeenCalledWith('search');
    expect(command.parts.list.getProps().role).toBe('listbox');
    expect(command.parts.item.getProps('search').aria?.selected).toBe(true);
    expect(command.parts.empty.getProps().role).toBeUndefined();
    expect(command.parts.empty.getProps().aria?.live).toBe('polite');
    expect(command.parts.loading.getProps().role).toBeUndefined();
    expect(command.parts.loading.getProps().aria?.live).toBe('polite');
    expect(command.parts.separator.getProps().role).toBe('presentation');
    expect(command.parts.separator.getProps().aria?.hidden).toBe(true);

    command.destroy();
  });
});
