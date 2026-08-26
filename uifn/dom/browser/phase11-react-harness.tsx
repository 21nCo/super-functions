import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Accordion, Dialog, RatingGroup, Slider } from '@uifn/react';

interface Phase11State {
  readonly accordionChanges: number;
  readonly accordionOpen: boolean;
  readonly sliderValue: number;
  readonly dialogOpen: boolean;
  readonly portalInBody: boolean;
  readonly rating: string | null;
  readonly warnings: readonly string[];
}

const warnings: string[] = [];
const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);
console.error = (...args) => { warnings.push(args.map(String).join(' ')); originalError(...args); };
console.warn = (...args) => { warnings.push(args.map(String).join(' ')); originalWarn(...args); };
let root: Root | null = null;
let accordionChanges = 0;
let sliderValue = 25;

function App() {
  const [value, setValue] = React.useState<readonly string[]>([]);
  return (
    <React.StrictMode>
      <Accordion value={value} onValueChange={(next) => {
        accordionChanges += 1;
        React.startTransition(() => setValue(next));
      }}>
        <Accordion.Item value="account">
          <Accordion.Header value="account">
            <Accordion.Trigger value="account" data-phase11-accordion-trigger>Account</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content value="account">Account details</Accordion.Content>
        </Accordion.Item>
      </Accordion>

      <Dialog defaultOpen>
        <Dialog.Trigger data-phase11-dialog-trigger>Open dialog</Dialog.Trigger>
        <Dialog.Portal data-phase11-portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Title>Production dialog</Dialog.Title>
              <Dialog.Description>Shared DOM focus and layer behavior</Dialog.Description>
              <Dialog.Close>Close dialog</Dialog.Close>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Portal>
      </Dialog>

      <Slider defaultValue={[25]} onValueChange={(next) => { sliderValue = next[0] ?? 0; }}>
        <Slider.Control data-phase11-slider style={{ width: 240, height: 32 }}>
          <Slider.Track><Slider.Range /></Slider.Track>
          <Slider.Thumb value={0} />
        </Slider.Control>
      </Slider>

      <form id="phase11-form">
        <RatingGroup defaultValue={2} name="rating">
          <RatingGroup.Item value={2}>Two</RatingGroup.Item>
          <RatingGroup.Item value={4}>Four</RatingGroup.Item>
          <RatingGroup.HiddenInput />
        </RatingGroup>
      </form>
    </React.StrictMode>
  );
}

function state(): Phase11State {
  return Object.freeze({
    accordionChanges,
    accordionOpen: document.querySelector('[data-phase11-accordion-trigger]')?.getAttribute('aria-expanded') === 'true',
    sliderValue,
    dialogOpen: document.querySelector('[role="dialog"]')?.getAttribute('data-state') === 'open',
    portalInBody: document.querySelector('[data-phase11-portal]')?.parentElement === document.body,
    rating: document.querySelector<HTMLInputElement>('input[name="rating"]')?.value ?? null,
    warnings: Object.freeze([...warnings]),
  });
}

function setup(): DOMRect {
  warnings.length = 0;
  accordionChanges = 0;
  sliderValue = 25;
  const fixture = document.createElement('div');
  fixture.id = 'phase11-react-root';
  document.body.append(fixture);
  root = createRoot(fixture, {
    onRecoverableError(error) { warnings.push(`recoverable:${String(error)}`); },
  });
  root.render(<App />);
  return document.querySelector('[data-phase11-slider]')?.getBoundingClientRect() ?? new DOMRect();
}

function finish() {
  const behavior = state();
  root?.unmount();
  root = null;
  document.querySelector('#phase11-react-root')?.remove();
  document.querySelector('[data-phase11-portal]')?.remove();
  return Object.freeze({ ...behavior, warnings: Object.freeze([...warnings]) });
}

declare global {
  interface Window {
    __UIFN_PHASE11_REACT__: {
      setup(): DOMRect;
      state(): Phase11State;
      finish(): Phase11State;
    };
  }
}

window.__UIFN_PHASE11_REACT__ = { setup, state, finish };
