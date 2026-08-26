<script lang="ts">
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import {
    ButtonLabel,
    ButtonRoot,
    ButtonSpinner,
  } from '@uifn/components-svelte/button';
  import {
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogPortal,
    DialogPositioner,
    DialogRoot,
    DialogTitle,
    DialogTrigger,
  } from '@uifn/components-svelte/dialog';
  import {
    FieldControl,
    FieldDescription,
    FieldError,
    FieldLabel,
    FieldRequiredIndicator,
    FieldRoot,
  } from '@uifn/components-svelte/field';
  import { FormActions, FormErrorSummary, FormRoot } from '@uifn/components-svelte/form';
  import { InputRoot } from '@uifn/components-svelte/input';
  import { SwitchControl, SwitchLabel, SwitchRoot, SwitchThumb } from '@uifn/components-svelte/switch';
  import { TextareaRoot } from '@uifn/components-svelte/textarea';
  import {
    createActionDraft,
    editableActionFields,
    validateActionInput,
    type ActionDraft,
    type ActionInputField,
    type ActionDraftValue,
  } from './action-form';
  import { fetchConsole, materializeAdminActionHref, openSafeAdminDownloadReceipt, safeAdminDownloadHref, scopedConsoleHref } from './admin-api';
  import { beginMutationFeedback, publishMutationFeedback, refreshSuccessfulMutation } from './mutation-outcome';
  import type { AdminActionViewModel } from './view-models';

  let {
    action,
    compact = false,
  }: { action: AdminActionViewModel; compact?: boolean } = $props();

  let running = $state(false);
  let result = $state<{ ok: boolean; message: string } | undefined>();
  let dialogOpen = $state(false);
  let draft = $state<ActionDraft>({});
  let errors = $state<Record<string, string>>({});
  let idempotencyKey: string | undefined;
  let idempotencyFingerprint: string | undefined;

  const fields = $derived(editableActionFields(action));
  const needsDialog = $derived(
    fields.length > 0 || action.requiresConfirmation === true || action.tone === 'danger'
  );

  function stableIdempotencyKey(input: Record<string, unknown>): string {
    const fingerprint = JSON.stringify(input);
    if (!idempotencyKey || idempotencyFingerprint !== fingerprint) {
      idempotencyKey = crypto.randomUUID();
      idempotencyFingerprint = fingerprint;
    }
    return idempotencyKey;
  }

  function resetDraft() {
    draft = createActionDraft(action);
    errors = {};
  }

  function setDraft(name: string, value: ActionDraftValue) {
    draft = { ...draft, [name]: value };
    if (errors[name]) {
      const { [name]: _removed, ...remaining } = errors;
      errors = remaining;
    }
  }

  function fieldId(field: ActionInputField): string {
    return `action-${action.id}-${field.name}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  function inputType(field: ActionInputField): string {
    if (field.type === 'number' || field.type === 'integer') return 'number';
    if (/(?:^|[-_])email$/i.test(field.name)) return 'email';
    if (/(?:^|[-_])(?:url|uri|href)$/i.test(field.name)) return 'url';
    if (/(?:password|passphrase|secret|token|credential|private[-_]?key|api[-_]?key|recovery[-_]?code)$/i.test(field.name)) return 'password';
    return 'text';
  }

  function scopedAdminEndpoint(endpoint: string | undefined, input: Record<string, unknown>, method: string): string | undefined {
    return safeAdminDownloadHref(materializeAdminActionHref(endpoint, input, method), {
      origin: page.url.origin,
      scope: page.url.searchParams,
    });
  }

  async function confirmationToken(input: Record<string, unknown>): Promise<string | undefined> {
    if (!action.requiresConfirmation) return undefined;
    const response = await fetchConsole(
      scopedConsoleHref('/api/admin/v1/confirmations', page.url.searchParams),
      {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ operationId: action.id, input }),
      }
    );
    const payload = await response.json().catch(() => undefined) as
      | { data?: { token?: string }; error?: { message?: string }; requestId?: string }
      | undefined;
    if (!response.ok || !payload?.data?.token) {
      const request = payload?.requestId ? ` (request ${payload.requestId})` : '';
      throw new Error(`${payload?.error?.message ?? 'The operation confirmation could not be issued.'}${request}`);
    }
    return payload.data.token;
  }

  async function runAction(input: Record<string, unknown>) {
    const method = (action.method ?? 'POST').toUpperCase();
    const endpoint = scopedAdminEndpoint(action.apiHref ?? action.href, input, method);
    if (!endpoint || action.disabled || running) {
      if (!endpoint) result = { ok: false, message: 'The action endpoint is not a trusted administration API URL.' };
      return;
    }
    running = true;
    result = undefined;
    const feedbackGeneration = beginMutationFeedback();
    try {
      const token = await confirmationToken(input);
      const headers = new Headers({ accept: 'application/json', 'content-type': 'application/json' });
      if (!['GET', 'HEAD'].includes(method)) headers.set('idempotency-key', stableIdempotencyKey(input));
      if (token) headers.set('x-admin-confirmation', token);
      const response = await fetchConsole(endpoint, {
        method,
        headers,
        body: ['GET', 'HEAD', 'DELETE'].includes(method) ? undefined : JSON.stringify(input),
      });
      const body = await response.json().catch(() => undefined) as
        | { error?: { message?: string }; message?: string; requestId?: string; auditId?: string; data?: { auditId?: string; requestId?: string; downloadUrl?: string; signedExternal?: boolean; item?: { url?: string; headers?: Record<string, string>; signedExternal?: boolean } } }
        | undefined;
      if (!response.ok) {
        const request = body?.requestId ? ` (request ${body.requestId})` : '';
        throw new Error(`${body?.error?.message ?? `HTTP ${response.status}`}${request}`);
      }
      const auditId = body?.auditId ?? body?.data?.auditId;
      const requestId = body?.requestId ?? body?.data?.requestId;
      const receipt = [
        auditId ? `Audit ${auditId}` : undefined,
        requestId ? `Request ${requestId}` : undefined,
      ].filter(Boolean).join(' · ');
      const successMessage = `${body?.message ?? `${action.label} completed.`}${receipt ? ` ${receipt}` : ''}`;
      if (action.id.endsWith('.download')) {
        const item = body?.data?.item;
        const receipt = item?.url
          ? { url: item.url, headers: item.headers, signedExternal: item.signedExternal }
          : body?.data?.downloadUrl
            ? { url: body.data.downloadUrl, signedExternal: body.data.signedExternal }
            : undefined;
        if (receipt && !await openSafeAdminDownloadReceipt(receipt)) {
          throw new Error('The download receipt did not contain a trusted URL.');
        }
      }
      idempotencyKey = undefined;
      idempotencyFingerprint = undefined;
      dialogOpen = false;
      const completed = { ok: true as const, message: successMessage, refreshed: false };
      publishMutationFeedback(completed, feedbackGeneration);
      const refreshed = await refreshSuccessfulMutation(successMessage, invalidateAll);
      publishMutationFeedback(refreshed, feedbackGeneration);
    } catch (cause) {
      result = {
        ok: false,
        message: cause instanceof Error ? cause.message : `${action.label} failed.`,
      };
    } finally {
      running = false;
    }
  }

  function submitDialog() {
    const validated = validateActionInput(action, draft);
    errors = validated.errors;
    if (!validated.ok) return;
    void runAction(validated.input);
  }

  function handleDialogOpen(open: boolean) {
    dialogOpen = open;
    if (open) {
      resetDraft();
      result = undefined;
    }
  }
</script>

{#if needsDialog}
  <DialogRoot open={dialogOpen} onOpenChange={handleDialogOpen} role={action.requiresConfirmation ? 'alertdialog' : 'dialog'}>
    <DialogTrigger
      class={`action-trigger ${action.tone === 'danger' ? 'action-trigger--danger' : ''}`}
      disabled={action.disabled}
    >
      {action.label}
    </DialogTrigger>
    <DialogPortal>
      <DialogBackdrop />
      <DialogPositioner>
        <DialogContent class="action-dialog">
          <DialogTitle>{fields.length ? action.label : `${action.label}?`}</DialogTitle>
          <DialogDescription>
            {action.description ?? 'This operator action is permission checked and recorded in the audit trail.'}
          </DialogDescription>
          <FormRoot
            class="action-form"
            invalid={Object.keys(errors).length > 0}
            onsubmit={(event: SubmitEvent) => {
              event.preventDefault();
              submitDialog();
            }}
          >
            {#each fields as field (field.name)}
              <FieldRoot class="action-form__field" required={field.required} invalid={Boolean(errors[field.name])}>
                {#if field.type === 'boolean'}
                  <SwitchRoot
                    class="action-form__boolean"
                    checked={draft[field.name] === true}
                    onCheckedChange={(checked: boolean) => setDraft(field.name, checked)}
                  >
                    <SwitchLabel>
                      {field.label}
                      {#if field.required}<FieldRequiredIndicator aria-label="required"> *</FieldRequiredIndicator>{/if}
                    </SwitchLabel>
                    <SwitchControl aria-describedby={field.description ? `${fieldId(field)}-description` : undefined}>
                      <SwitchThumb />
                    </SwitchControl>
                  </SwitchRoot>
                {:else}
                  <FieldLabel for={fieldId(field)}>
                    {field.label}
                    {#if field.required}<FieldRequiredIndicator aria-label="required"> *</FieldRequiredIndicator>{/if}
                  </FieldLabel>
                  {#if field.type === 'object' || field.type === 'array' || field.type === 'json'}
                    <FieldControl>
                      <TextareaRoot
                        id={fieldId(field)}
                        value={typeof draft[field.name] === 'string' ? draft[field.name] : ''}
                        oninput={(event: Event) => setDraft(field.name, (event.currentTarget as HTMLTextAreaElement).value)}
                        required={field.required}
                        aria-invalid={Boolean(errors[field.name])}
                        aria-describedby={field.description ? `${fieldId(field)}-description` : undefined}
                        rows={5}
                        spellcheck="false"
                      />
                    </FieldControl>
                  {:else}
                    <FieldControl>
                      <InputRoot
                        id={fieldId(field)}
                        type={inputType(field)}
                        step={field.type === 'integer' ? '1' : field.type === 'number' ? 'any' : undefined}
                        value={typeof draft[field.name] === 'string' ? draft[field.name] : ''}
                        oninput={(event: Event) => setDraft(field.name, (event.currentTarget as HTMLInputElement).value)}
                        required={field.required}
                        aria-invalid={Boolean(errors[field.name])}
                        aria-describedby={field.description ? `${fieldId(field)}-description` : undefined}
                        autocomplete="off"
                      />
                    </FieldControl>
                  {/if}
                {/if}
                {#if field.description}<FieldDescription id={`${fieldId(field)}-description`}>{field.description}</FieldDescription>{/if}
                {#if errors[field.name]}<FieldError>{errors[field.name]}</FieldError>{/if}
              </FieldRoot>
            {/each}
            <FormErrorSummary>
              {Object.values(errors)[0] ?? 'Correct the highlighted action input.'}
            </FormErrorSummary>
            <FormActions class="action-dialog__actions">
              <DialogClose disabled={running}>Cancel</DialogClose>
              <ButtonRoot
                type="submit"
                variant={action.tone === 'danger' ? 'destructive' : 'primary'}
                disabled={running}
                loading={running}
              >
                <ButtonSpinner />
                <ButtonLabel>{running ? 'Working…' : action.requiresConfirmation ? `Confirm ${action.label}` : action.label}</ButtonLabel>
              </ButtonRoot>
            </FormActions>
          </FormRoot>
        </DialogContent>
      </DialogPositioner>
    </DialogPortal>
  </DialogRoot>
{:else}
  <ButtonRoot
    variant="outline"
    size={compact ? 'sm' : 'md'}
    disabled={action.disabled || running}
    loading={running}
    onclick={() => void runAction(action.input ?? {})}
  >
    <ButtonSpinner />
    <ButtonLabel>{action.label}</ButtonLabel>
  </ButtonRoot>
{/if}

{#if result}
  <span class:action-result--error={!result.ok} class="action-result" role="status">
    {result.message}
  </span>
{/if}
