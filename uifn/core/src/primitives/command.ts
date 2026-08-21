import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import {
  createUIFnSelectionPrimitiveController,
  type UIFnSelectionActions,
  type UIFnSelectionInputs,
  type UIFnSelectionItem,
  type UIFnSelectionPart,
  type UIFnSelectionState,
} from './selection-control';

export interface CommandItem extends UIFnSelectionItem<string> {
  readonly value: string;
  readonly label: string;
  readonly keywords?: readonly string[];
}

export interface CommandProps extends UIFnSelectionInputs<CommandItem | string> {
  readonly placeholder?: string;
}

export type CommandState = UIFnSelectionState;
export type CommandActions = UIFnSelectionActions<CommandItem | string>;
export interface CommandControllerParts {
  readonly root: UIFnSelectionPart;
  readonly label: UIFnSelectionPart;
  readonly input: UIFnSelectionPart;
  readonly list: UIFnSelectionPart;
  readonly empty: UIFnSelectionPart;
  readonly loading: UIFnSelectionPart;
  readonly group: UIFnSelectionPart;
  readonly groupHeading: UIFnSelectionPart;
  readonly item: UIFnSelectionPart;
  readonly itemIndicator: UIFnSelectionPart;
  readonly separator: UIFnSelectionPart;
  readonly shortcut: UIFnSelectionPart;
  readonly hiddenInput: UIFnSelectionPart;
}
export type CommandController = UIFnController<
  CommandState,
  CommandActions,
  CommandControllerParts,
  CommandProps
>;

export function createCommandController(
  props: CommandProps = {},
  environment: UIFnEnvironment = {},
): CommandController {
  return createUIFnSelectionPrimitiveController({
    primitive: 'Command',
    slug: 'command',
    anatomy: [
      'root',
      'label',
      'input',
      'list',
      'empty',
      'loading',
      'group',
      'groupHeading',
      'item',
      'itemIndicator',
      'separator',
      'shortcut',
      'hiddenInput',
    ],
    editable: true,
    itemPart: 'item',
    itemRole: 'option',
    inputRole: 'combobox',
    contentRole: 'listbox',
    contentPart: 'list',
    selectionAria: 'selected',
    closeOnSelect: false,
  }, { defaultOpen: true, ...props }, environment) as unknown as CommandController;
}
