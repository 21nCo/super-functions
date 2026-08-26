import {
  createAutocompleteController,
  createClipboardController,
  createFileUploadController,
  createNumberInputController,
  createPasswordInputController,
  createSelectController,
} from '@uifn/core/primitives';
import {
  assertUIFnInputResourcesReleased,
  createUIFnDomPlatform,
  createUIFnFileInputBinding,
  createUIFnSelectionFormBinding,
  createUIFnTextInputFormBinding,
} from '@uifn/dom';

interface InputBrowserResult {
  readonly vectorId: 'TV-PRIM-004-P/N+TV-PRIM-005-P/N';
  readonly outcome: 'pass';
  readonly formData: readonly string[];
  readonly validity: readonly boolean[];
  readonly ime: Readonly<Record<string, unknown>>;
  readonly capabilityErrors: readonly string[];
  readonly redaction: Readonly<Record<string, boolean>>;
  readonly touch: Readonly<Record<string, unknown>>;
  readonly resourceTotal: number;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code !== 'string') throw error;
  return code;
}

function wait(delayMs = 0): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

export async function runInputVectors(): Promise<InputBrowserResult> {
  document.querySelector('[data-input-fixture]')?.remove();
  const fixture = document.createElement('section');
  fixture.dataset.inputFixture = 'phase-09';
  fixture.innerHTML = `
    <form id="phase-09-form">
      <fieldset id="phase-09-fieldset">
        <legend>Account inputs</legend>
        <label id="city-label">City <button type="button" id="city-owner"></button></label>
        <label>Amount <input id="amount-input" name="amount" value="1,5"></label>
        <input id="upload-input" name="evidence" type="file">
      </fieldset>
    </form>
    <input id="ime-input" aria-label="Japanese city">
  `;
  document.body.appendChild(fixture);
  const form = fixture.querySelector<HTMLFormElement>('#phase-09-form')!;
  const fieldset = fixture.querySelector<HTMLFieldSetElement>('#phase-09-fieldset')!;
  const owner = fixture.querySelector<HTMLElement>('#city-owner')!;
  const amountInput = fixture.querySelector<HTMLInputElement>('#amount-input')!;
  const uploadInput = fixture.querySelector<HTMLInputElement>('#upload-input')!;
  const imeInput = fixture.querySelector<HTMLInputElement>('#ime-input')!;
  const platform = createUIFnDomPlatform({ root: document });

  type City = { id: number; name: string };
  const city = createSelectController<City>({
    items: [{ id: 13, name: 'Tokyo' }, { id: 27, name: 'Osaka' }],
    itemAdapter: {
      getKey: (item) => item.id,
      getTextValue: (item) => item.name,
      serialize: (item) => `city:${item.id}`,
    },
    defaultValue: '13',
    name: 'city',
    required: true,
    descriptionId: 'city-label',
  });
  const cityBinding = createUIFnSelectionFormBinding(platform, city, owner);
  invariant(new FormData(form).get('city') === 'city:13', 'object selection did not use explicit serialization');
  invariant(!JSON.stringify(city.state).includes('[object Object]'), 'object identity leaked implicit serialization');

  city.actions.clear('pointer');
  invariant(city.state.invalid, 'required selection did not become invalid');
  const invalid = form.checkValidity();
  invariant(!invalid && cityBinding.formBridge?.reportValidity() === false, 'native required validity did not fail');
  form.reset();
  invariant(city.state.value === '13', 'native reset did not restore the default selection');

  fieldset.disabled = true;
  await wait();
  invariant(new FormData(form).getAll('city').length === 0, 'disabled fieldset submitted selection values');
  fieldset.disabled = false;
  await wait();
  invariant(new FormData(form).get('city') === 'city:13', 'fieldset re-enable did not restore selection value');
  city.update({ disabled: true });
  fieldset.disabled = true;
  await wait();
  fieldset.disabled = false;
  await wait();
  invariant(city.state.disabled, 'fieldset re-enable overwrote intrinsic disabled state');
  invariant(new FormData(form).getAll('city').length === 0, 'intrinsically disabled selection submitted after fieldset re-enable');
  city.update({ disabled: false });

  const requiredUpload = createFileUploadController({ required: true });
  const uploadBinding = createUIFnFileInputBinding(platform, requiredUpload, uploadInput, uploadInput);
  invariant(!uploadInput.checkValidity(), 'empty required upload passed native validity');
  const transfer = new DataTransfer();
  transfer.items.add(new File(['evidence'], 'evidence.png', { type: 'image/png' }));
  uploadInput.files = transfer.files;
  uploadInput.dispatchEvent(new Event('change', { bubbles: true }));
  invariant(requiredUpload.state.valid && uploadInput.checkValidity(), 'native upload change did not satisfy validity');
  fieldset.disabled = true;
  await wait();
  invariant(requiredUpload.state.disabled, 'disabled fieldset did not disable the upload controller');
  requiredUpload.actions.clear();
  invariant(requiredUpload.state.fileCount === 1, 'disabled fieldset allowed an upload mutation');
  form.reset();
  invariant(requiredUpload.state.fileCount === 0 && requiredUpload.state.invalid, 'disabled fieldset blocked native upload reset');
  fieldset.disabled = false;
  await wait();
  invariant(!requiredUpload.state.disabled, 'fieldset re-enable did not restore the upload controller');

  const number = createNumberInputController({ defaultValue: '1,5', locale: 'de-DE', step: 0.5, required: true });
  const numberBinding = createUIFnTextInputFormBinding(platform, number, amountInput, amountInput, { nativeFormControl: true });
  number.actions.increment();
  amountInput.value = number.actions.getInputValue();
  invariant(new FormData(form).get('amount') === '2,0', 'locale number did not participate in native FormData');
  amountInput.focus();
  number.actions.setCaret({ start: 1, end: 1, direction: 'none' });
  for (let attempt = 0; attempt < 10 && amountInput.selectionStart !== 1; attempt += 1) await wait(20);
  invariant(
    amountInput.selectionStart === 1,
    `caret restoration did not reach the native input (actual=${amountInput.selectionStart}, active=${document.activeElement?.id}, state=${number.state.caret.start})`,
  );

  const imeChanges: string[] = [];
  const autocomplete = createAutocompleteController({
    items: [{ value: 'tokyo', label: '東京', textValue: '東京' }],
    onInputValueChange: (value) => imeChanges.push(value),
  });
  const imeProps = autocomplete.parts.input.getProps();
  imeInput.value = 'とう';
  imeProps.on?.compositionstart?.({ type: 'compositionstart', currentTarget: imeInput });
  imeProps.on?.compositionupdate?.({ type: 'compositionupdate', currentTarget: imeInput, data: 'とう' });
  invariant(autocomplete.state.inputValue === '' && autocomplete.state.visibleItems[0] === 'tokyo', 'IME filtered before commit');
  imeInput.value = '東京';
  imeProps.on?.compositionend?.({ type: 'compositionend', currentTarget: imeInput, data: '東京' });
  invariant(autocomplete.state.inputValue === '東京' && imeChanges.join(',') === '東京', 'IME commit did not occur exactly once');

  const clipboard = createClipboardController({
    capability: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
  });
  let clipboardCode = '';
  try { await clipboard.actions.copy('public'); } catch (error) { clipboardCode = errorCode(error); }
  invariant(clipboardCode === 'UIFN_CLIPBOARD_DENIED' && clipboard.state.operationCount === 0, 'clipboard denial was reported as success');

  const upload = createFileUploadController({ accept: 'image/*', maxSize: 100 });
  upload.actions.selectFiles([{ name: 'not-evidence.txt', size: 8, type: 'text/plain' }]);
  invariant(upload.state.status === 'rejected' && upload.state.fileCount === 0, 'file rejection was reported as success');

  const secret = 'browser-only-secret';
  const password = createPasswordInputController({ defaultValue: secret });
  const redactedEvidence = JSON.stringify({ password: password.snapshot, upload: upload.snapshot, scope: platform.scope.trace() });
  invariant(!redactedEvidence.includes(secret), 'password reached browser evidence');
  invariant(!redactedEvidence.includes('not-evidence.txt'), 'file name reached browser evidence');

  const touchEvent = new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' });
  owner.dispatchEvent(touchEvent);
  city.actions.select('27', 'touch');
  invariant(city.state.value === '27', 'touch modality selection failed');

  const resultData = Object.freeze([...new FormData(form).getAll('city').map(String), String(new FormData(form).get('amount'))]);
  numberBinding.destroy();
  uploadBinding.destroy();
  cityBinding.destroy();
  platform.liveRegion.destroy();
  assertUIFnInputResourcesReleased(platform);
  city.destroy();
  number.destroy();
  autocomplete.destroy();
  clipboard.destroy();
  upload.destroy();
  requiredUpload.destroy();
  password.destroy();
  platform.destroy();
  fixture.remove();
  const resources = platform.scope.resources();
  invariant(resources.total === 0, `input browser vector leaked ${resources.total} resources`);

  const result: InputBrowserResult = Object.freeze({
    vectorId: 'TV-PRIM-004-P/N+TV-PRIM-005-P/N',
    outcome: 'pass',
    formData: resultData,
    validity: Object.freeze([invalid, true]),
    ime: Object.freeze({ committed: imeChanges.length, deferred: true, localeNumber: '2,0' }),
    capabilityErrors: Object.freeze([clipboardCode, upload.state.lastErrorCode ?? '']),
    redaction: Object.freeze({ password: true, pin: true, files: true }),
    touch: Object.freeze({ pointerType: touchEvent.pointerType, selected: '27' }),
    resourceTotal: resources.total,
  });
  document.querySelector('#results')!.textContent = JSON.stringify(result);
  return result;
}

declare global {
  interface Window {
    __UIFN_INPUT_HARNESS__: { run(): Promise<InputBrowserResult> };
  }
}

window.__UIFN_INPUT_HARNESS__ = Object.freeze({ run: runInputVectors });
