<script lang="ts">
  import * as UIFnSvelte from '../../lib/index.js';
  import { phase14PartProps } from '../../../parity/src/trace.mjs';

  interface Props {
    vector: any;
    rootProps: Record<string, unknown>;
  }

  let { vector, rootProps }: Props = $props();
  const Compound = $derived((UIFnSvelte as Record<string, any>)[vector.primitive]);
  const root = $derived(vector.anatomy[0]);
  const Root = $derived(Compound[root.component]);
  const parts = $derived(vector.anatomy.slice(1));
  const childlessElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'textarea', 'track', 'wbr']);
  const elementName = (element: string) => element === 'heading' ? 'h2' : element;
</script>

<Root {...rootProps}>
  {#if vector.primitive === 'Menu' || vector.primitive === 'ContextMenu'}
    {@const byId = (id: string) => parts.find((part: any) => part.id === id)}
    {@const Trigger = Compound.Trigger}
    {@const Positioner = Compound.Positioner}
    {@const Content = Compound.Content}
    {@const Item = Compound.Item}
    {@const ItemIndicator = Compound.ItemIndicator}
    {@const Separator = Compound.Separator}
    {@const Group = Compound.Group}
    {@const GroupLabel = Compound.GroupLabel}
    {@const SubmenuTrigger = Compound.SubmenuTrigger}
    {@const SubmenuContent = Compound.SubmenuContent}
    <Trigger {...phase14PartProps(vector, byId('trigger'))}>{vector.primitive} Trigger</Trigger>
    <Positioner {...phase14PartProps(vector, byId('positioner'))}>
      <Content {...phase14PartProps(vector, byId('content'))}>
        <Item {...phase14PartProps(vector, byId('item'))}>
          <ItemIndicator {...phase14PartProps(vector, byId('itemIndicator'))}>{vector.primitive} ItemIndicator</ItemIndicator>
        </Item>
        <Separator {...phase14PartProps(vector, byId('separator'))}>{vector.primitive} Separator</Separator>
        <Group {...phase14PartProps(vector, byId('group'))}>
          <GroupLabel {...phase14PartProps(vector, byId('groupLabel'))}>{vector.primitive} GroupLabel</GroupLabel>
        </Group>
        <SubmenuTrigger {...phase14PartProps(vector, byId('submenuTrigger'))}>{vector.primitive} SubmenuTrigger</SubmenuTrigger>
        <SubmenuContent {...phase14PartProps(vector, byId('submenuContent'))}>{vector.primitive} SubmenuContent</SubmenuContent>
      </Content>
    </Positioner>
  {:else if vector.primitive === 'DatePicker'}
    {@const byId = (id: string) => parts.find((part: any) => part.id === id)}
    {@const Label = Compound.Label}
    {@const Input = Compound.Input}
    {@const Segment = Compound.Segment}
    {@const Trigger = Compound.Trigger}
    {@const Positioner = Compound.Positioner}
    {@const Content = Compound.Content}
    {@const Header = Compound.Header}
    {@const Previous = Compound.Previous}
    {@const Next = Compound.Next}
    {@const Grid = Compound.Grid}
    {@const GridLabel = Compound.GridLabel}
    {@const Cell = Compound.Cell}
    {@const CellTrigger = Compound.CellTrigger}
    {@const HiddenInput = Compound.HiddenInput}
    <Label {...phase14PartProps(vector, byId('label'))}>DatePicker Label</Label>
    <Input {...phase14PartProps(vector, byId('input'))}>
      <Segment {...phase14PartProps(vector, byId('segment'))}>DatePicker Segment</Segment>
    </Input>
    <Trigger {...phase14PartProps(vector, byId('trigger'))}>DatePicker Trigger</Trigger>
    <Positioner {...phase14PartProps(vector, byId('positioner'))}>
      <Content {...phase14PartProps(vector, byId('content'))}>
        <Header {...phase14PartProps(vector, byId('header'))}>
          <Previous {...phase14PartProps(vector, byId('previous'))}>DatePicker Previous</Previous>
          <Next {...phase14PartProps(vector, byId('next'))}>DatePicker Next</Next>
        </Header>
        <Grid {...phase14PartProps(vector, byId('grid'))}>
          <GridLabel {...phase14PartProps(vector, byId('gridLabel'))}>DatePicker GridLabel</GridLabel>
          <tbody><tr><Cell {...phase14PartProps(vector, byId('cell'))}>
            <CellTrigger {...phase14PartProps(vector, byId('cellTrigger'))}>DatePicker CellTrigger</CellTrigger>
          </Cell></tr></tbody>
        </Grid>
      </Content>
    </Positioner>
    <HiddenInput {...phase14PartProps(vector, byId('hiddenInput'))} />
  {:else if vector.primitive === 'Table'}
    {@const byId = (id: string) => parts.find((part: any) => part.id === id)}
    {@const Table = Compound.Table}
    {@const Caption = Compound.Caption}
    {@const Header = Compound.Header}
    {@const Body = Compound.Body}
    {@const Footer = Compound.Footer}
    {@const Row = Compound.Row}
    {@const Head = Compound.Head}
    {@const Cell = Compound.Cell}
    <Table {...phase14PartProps(vector, byId('table'))}>
      <Caption {...phase14PartProps(vector, byId('caption'))}>Table Caption</Caption>
      <Header {...phase14PartProps(vector, byId('header'))}>
        <tr><Head {...phase14PartProps(vector, byId('head'))}>Table Head</Head></tr>
      </Header>
      <Body {...phase14PartProps(vector, byId('body'))}>
        <Row {...phase14PartProps(vector, byId('row'))}>
          <Cell {...phase14PartProps(vector, byId('cell'))}>Table Cell</Cell>
        </Row>
      </Body>
      <Footer {...phase14PartProps(vector, byId('footer'))}>
        <tr><td>Table Footer</td></tr>
      </Footer>
    </Table>
  {:else}
    {#each parts as part (`${part.id}:${part.value ?? 'one'}`)}
      {@const Part = Compound[part.component]}
      {@const props = phase14PartProps(vector, part)}
      {#if childlessElements.has(elementName(part.element))}
        <Part {...props} />
      {:else}
        <Part {...props}>{vector.primitive} {part.component}</Part>
      {/if}
    {/each}
  {/if}
</Root>
