import {
  createCapabilityAdminClient,
  type AdminClient,
  type AdminClientRequestOptions,
} from "@superfunctions/admin";
import { sendFnAdminCapability } from "./capability.js";
import type {
  SendFnAddSuppressionInput,
  SendFnCleanupDevicesInput,
  SendFnDeactivateDeviceInput,
  SendFnGetSuppressionInput,
  SendFnGetTemplateInput,
  SendFnListDeliveriesInput,
  SendFnListDeviceTokensInput,
  SendFnListSuppressionsInput,
  SendFnRefreshDeviceInput,
  SendFnRegisterDeviceInput,
  SendFnRegisterTemplateInput,
  SendFnRemoveSuppressionInput,
  SendFnSendBulkEmailInput,
  SendFnSendBulkPushInput,
  SendFnSendEmailInput,
  SendFnSendPushInput,
  SendFnSendSmsInput,
  SendFnSendWhatsAppInput,
} from "./types.js";

/** Function-scoped TypeScript client with named methods for every SendFn operation. */
export function createSendFnAdminClient(adminClient: AdminClient) {
  const client = createCapabilityAdminClient(sendFnAdminCapability, adminClient);
  return Object.assign(client, {
    templates: {
      list: (options?: AdminClientRequestOptions) => client.invoke("sendfn.templates.list", {}, options),
      get: (input: SendFnGetTemplateInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.templates.get", input, options),
      register: (input: SendFnRegisterTemplateInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.templates.register", input, options),
    },
    deliveries: {
      list: (input: SendFnListDeliveriesInput = {}, options?: AdminClientRequestOptions) => client.invoke("sendfn.deliveries.list", input, options),
    },
    messages: {
      sendEmail: (input: SendFnSendEmailInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.messages.send-email", input, options),
      sendBulkEmail: (input: SendFnSendBulkEmailInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.messages.send-email-bulk", input, options),
      sendSms: (input: SendFnSendSmsInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.messages.send-sms", input, options),
      sendWhatsApp: (input: SendFnSendWhatsAppInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.messages.send-whatsapp", input, options),
      sendPush: (input: SendFnSendPushInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.messages.send-push", input, options),
      sendBulkPush: (input: SendFnSendBulkPushInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.messages.send-push-bulk", input, options),
    },
    suppressions: {
      list: (input: SendFnListSuppressionsInput = {}, options?: AdminClientRequestOptions) => client.invoke("sendfn.suppressions.list", input, options),
      get: (input: SendFnGetSuppressionInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.suppressions.get", input, options),
      add: (input: SendFnAddSuppressionInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.suppressions.add", input, options),
      remove: (input: SendFnRemoveSuppressionInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.suppressions.remove", input, options),
    },
    deviceTokens: {
      list: (input: SendFnListDeviceTokensInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.device-tokens.list", input, options),
      register: (input: SendFnRegisterDeviceInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.device-tokens.register", input, options),
      deactivate: (input: SendFnDeactivateDeviceInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.device-tokens.deactivate", input, options),
      refresh: (input: SendFnRefreshDeviceInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.device-tokens.refresh", input, options),
      cleanup: (input: SendFnCleanupDevicesInput, options?: AdminClientRequestOptions) => client.invoke("sendfn.device-tokens.cleanup", input, options),
    },
  });
}
