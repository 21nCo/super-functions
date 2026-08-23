<script lang="ts">
  let { Root, parts, primitive, scenario, rootId, rootElement, rootProps, rootVoid } = $props<any>();
  const childrenFor = (parentId: string) => parts.filter((part: any) => part.parentId === parentId);
  const collectionPrimitives = new Set(['autocomplete', 'combobox', 'command', 'listbox', 'select']);
  const instancesFor = (part: any, parentValue: unknown = undefined) => {
    if (primitive === 'splitter' && part.id === 'panel') {
      return [{ ...part, value: 0, instanceKey: '0' }, { ...part, value: 1, instanceKey: '1' }];
    }
    if (collectionPrimitives.has(primitive) && part.id === 'item') {
      return ['item-1', 'item-2', 'item-3'].map((value) => ({ ...part, value, instanceKey: value }));
    }
    if (collectionPrimitives.has(primitive) && part.many && parentValue !== undefined) {
      return [{ ...part, value: parentValue, instanceKey: String(parentValue) }];
    }
    return [part];
  };
  const ownText = (part: any) => {
    if (primitive === 'color-picker' && part.id === 'swatch') return null;
    if (primitive === 'command' && part.id === 'separator') return null;
    if (['button', 'a', 'label', 'legend', 'heading', 'p'].includes(part.element)) return `${part.id} fixture`;
    if (part.id === 'item' || (primitive === 'tooltip' && part.id === 'content')) return `${part.id} fixture`;
    return null;
  };
</script>

{#snippet renderPart(part: any)}
  {@const Part = part.Component}
  {@const descendants = childrenFor(part.id)}
  {@const regularDescendants = descendants.filter((child: any) => child.element !== 'td')}
  {@const cellDescendants = descendants.filter((child: any) => child.element === 'td')}
  {#if part.voidElement}
    <Part
      {...(part.many ? { value: part.value } : {})}
      {...(part.element === 'img' ? { alt: `${primitive} ${part.id}` } : {})}
      {...(primitive === 'input-group' && ['input', 'textarea'].includes(part.id)
        ? { 'aria-label': `Input group ${part.id}` }
        : {})}
      data-uifn-story-anatomy={part.id}
    />
  {:else}
    <Part
      {...(part.many ? { value: part.value } : {})}
      {...(primitive === 'input-group' && ['input', 'textarea'].includes(part.id)
        ? { 'aria-label': `Input group ${part.id}` }
        : {})}
      data-uifn-story-anatomy={part.id}
    >
      {#if ownText(part)}
        {ownText(part)}
      {/if}
      {#if descendants.length === 0}
        {#if !ownText(part) && !(primitive === 'color-picker' && part.id === 'swatch') && !(primitive === 'command' && part.id === 'separator')}
          {part.id} fixture
        {/if}
      {:else}
        {#each regularDescendants as child (child.id)}
          {#each instancesFor(child, part.value) as instance (`${instance.id}-${instance.instanceKey ?? 'default'}`)}
            {@render renderPart(instance)}
          {/each}
        {/each}
        {#if cellDescendants.length}
          <tbody>
            <tr>
              {#each cellDescendants as child (child.id)}
                {@render renderPart(child)}
              {/each}
            </tr>
          </tbody>
        {/if}
      {/if}
    </Part>
  {/if}
{/snippet}

<section
  data-uifn-story-id={`${primitive}--${scenario}`}
  data-uifn-story-framework="svelte"
  data-uifn-story-scenario={scenario}
  data-uifn-theme={scenario === 'forced-colors' ? 'high-contrast' : 'light'}
  data-uifn-forced-colors={String(scenario === 'forced-colors')}
  data-uifn-reduced-motion={String(scenario === 'reduced-motion')}
  dir={scenario === 'rtl' ? 'rtl' : 'ltr'}
>
  {#if primitive === 'table'}
    {@const Table = parts.find((part: any) => part.id === 'table').Component}
    {@const Caption = parts.find((part: any) => part.id === 'caption').Component}
    {@const Header = parts.find((part: any) => part.id === 'header').Component}
    {@const Body = parts.find((part: any) => part.id === 'body').Component}
    {@const Footer = parts.find((part: any) => part.id === 'footer').Component}
    {@const Row = parts.find((part: any) => part.id === 'row').Component}
    {@const Head = parts.find((part: any) => part.id === 'head').Component}
    {@const Cell = parts.find((part: any) => part.id === 'cell').Component}
    <Root {...rootProps}>
      <Table data-uifn-story-anatomy="table">
        <Caption data-uifn-story-anatomy="caption">Project status</Caption>
        <Header data-uifn-story-anatomy="header">
          <Row value="header" data-uifn-story-anatomy="row">
            <Head value="name" data-uifn-story-anatomy="head">Project</Head>
            <Head value="status" data-uifn-story-anatomy="head">Status</Head>
          </Row>
        </Header>
        <Body data-uifn-story-anatomy="body">
          <Row value="project-1" data-uifn-story-anatomy="row">
            <Cell value="project-1-name" data-uifn-story-anatomy="cell">Nucleus</Cell>
            <Cell value="project-1-status" data-uifn-story-anatomy="cell">Ready</Cell>
          </Row>
          <Row value="project-2" data-uifn-story-anatomy="row">
            <Cell value="project-2-name" data-uifn-story-anatomy="cell">Router</Cell>
            <Cell value="project-2-status" data-uifn-story-anatomy="cell">In review</Cell>
          </Row>
        </Body>
        <Footer data-uifn-story-anatomy="footer">
          <Row value="summary" data-uifn-story-anatomy="row">
            <Cell value="summary" colspan={2} data-uifn-story-anatomy="cell">2 projects</Cell>
          </Row>
        </Footer>
      </Table>
    </Root>
  {:else if rootVoid}
    <Root {...rootProps} {...(rootElement === 'img' ? { alt: `${primitive} example` } : {})} />
  {:else}
    <Root {...rootProps}>
      {@const rootChildren = childrenFor(rootId)}
      {#if rootChildren.length}
        {#each rootChildren as part (part.id)}
          {#each instancesFor(part) as instance (`${instance.id}-${instance.instanceKey ?? 'default'}`)}
            {@render renderPart(instance)}
          {/each}
        {/each}
      {:else}
        {primitive} fixture
      {/if}
    </Root>
  {/if}
</section>
