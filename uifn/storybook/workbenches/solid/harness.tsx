// @ts-nocheck
import { createComponent } from 'solid-js';

export function StoryHarness(props) {
  const childrenFor = (parentId) => props.parts.filter((part) => part.parentId === parentId);
  const collectionPrimitives = new Set(['autocomplete', 'combobox', 'command', 'listbox', 'select']);
  const instancesFor = (part, parentValue) => {
    if (props.primitive === 'splitter' && part.id === 'panel') {
      return [{ ...part, value: 0, instanceKey: '0' }, { ...part, value: 1, instanceKey: '1' }];
    }
    if (collectionPrimitives.has(props.primitive) && part.id === 'item') {
      return ['item-1', 'item-2', 'item-3'].map((value) => ({ ...part, value, instanceKey: value }));
    }
    if (collectionPrimitives.has(props.primitive) && part.many && parentValue !== undefined) {
      return [{ ...part, value: parentValue, instanceKey: String(parentValue) }];
    }
    return [part];
  };
  const ownText = (part) => {
    if (props.primitive === 'color-picker' && part.id === 'swatch') return null;
    if (props.primitive === 'command' && part.id === 'separator') return null;
    if (['button', 'a', 'label', 'legend', 'heading', 'p'].includes(part.element)) return `${part.id} fixture`;
    if (part.id === 'item' || (props.primitive === 'tooltip' && part.id === 'content')) return `${part.id} fixture`;
    return null;
  };
  const renderTable = () => {
    const component = (id) => props.parts.find((part) => part.id === id).Component;
    const Root = props.Root;
    const Table = component('table');
    const Caption = component('caption');
    const Header = component('header');
    const Body = component('body');
    const Footer = component('footer');
    const Row = component('row');
    const Head = component('head');
    const Cell = component('cell');
    return (
      <Root {...props.rootProps}>
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
              <Cell value="summary" colSpan={2} data-uifn-story-anatomy="cell">2 projects</Cell>
            </Row>
          </Footer>
        </Table>
      </Root>
    );
  };
  const renderPart = (part) => {
    const descendants = childrenFor(part.id);
    const regularDescendants = descendants.filter((child) => child.element !== 'td');
    const cellDescendants = descendants.filter((child) => child.element === 'td');
    const children = () => {
      const rendered = [ownText(part), ...regularDescendants.flatMap((child) => instancesFor(child, part.value).map(renderPart))].filter(Boolean);
      if (cellDescendants.length) rendered.push(<tbody><tr>{cellDescendants.map(renderPart)}</tr></tbody>);
      return rendered.length
        || (props.primitive === 'color-picker' && part.id === 'swatch')
        || (props.primitive === 'command' && part.id === 'separator')
        ? rendered
        : `${part.id} fixture`;
    };
    return createComponent(part.Component, {
      ...(part.many ? { value: part.value } : {}),
      ...(part.element === 'img' ? { alt: `${props.primitive} ${part.id}` } : {}),
      ...(props.primitive === 'input-group' && ['input', 'textarea'].includes(part.id)
        ? { 'aria-label': `Input group ${part.id}` }
        : {}),
      'data-uifn-story-anatomy': part.id,
      get children() { return part.voidElement ? undefined : children(); },
    });
  };
  const rootChildren = () => childrenFor(props.rootId).flatMap((part) => instancesFor(part).map(renderPart));
  return (
    <section
      data-uifn-story-id={`${props.primitive}--${props.scenario}`}
      data-uifn-story-framework="solid"
      data-uifn-story-scenario={props.scenario}
      data-uifn-theme={props.scenario === 'forced-colors' ? 'high-contrast' : 'light'}
      data-uifn-forced-colors={String(props.scenario === 'forced-colors')}
      data-uifn-reduced-motion={String(props.scenario === 'reduced-motion')}
      dir={props.scenario === 'rtl' ? 'rtl' : 'ltr'}
    >
      {props.primitive === 'table' ? renderTable() : createComponent(props.Root, {
        ...props.rootProps,
        ...(props.rootElement === 'img' ? { alt: `${props.primitive} example` } : {}),
        get children() {
          if (props.rootVoid) return undefined;
          const rendered = rootChildren();
          return rendered.length ? rendered : `${props.primitive} fixture`;
        },
      })}
    </section>
  );
}
