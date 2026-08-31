import type {
  AddSuppressionParams,
  CommunicationEvent,
  DeviceToken,
  EmailTemplate,
  EmailTransaction,
  Platform,
  PushNotification,
  QueryEventsParams,
  RegisterDeviceParams,
  SendEmailParams,
  SendPushParams,
  SendSmsParams,
  SendWhatsAppParams,
  SendfnClient,
  SmsTransaction,
  SuppressionList,
  WhatsAppTransaction,
} from "sendfn";
import type { AdminOperationContext } from "@superfunctions/admin";

/** JSON transport form of a SendFn domain object. */
export type SendFnAdminJson<T> =
  T extends Date ? string
    : T extends readonly (infer TItem)[] ? SendFnAdminJson<TItem>[]
      : T extends object ? { [TKey in keyof T]: SendFnAdminJson<T[TKey]> }
        : T;

export type SendFnAdminTemplate = SendFnAdminJson<EmailTemplate>;
export type SendFnAdminEmailTransaction = SendFnAdminJson<EmailTransaction>;
export type SendFnAdminSmsTransaction = SendFnAdminJson<SmsTransaction>;
export type SendFnAdminWhatsAppTransaction = SendFnAdminJson<WhatsAppTransaction>;
export type SendFnAdminPushNotification = SendFnAdminJson<PushNotification>;
export type SendFnAdminDeliveryEvent = SendFnAdminJson<CommunicationEvent>;
export type SendFnAdminSuppression = SendFnAdminJson<SuppressionList>;
export type SendFnAdminDeviceToken = SendFnAdminJson<DeviceToken>;

export interface SendFnListTemplatesInput {}
export interface SendFnGetTemplateInput { id: string }
export interface SendFnRegisterTemplateInput { template: EmailTemplate }
export interface SendFnTemplateListOutput {
  items: SendFnAdminTemplate[];
  nextCursor: null;
}
export interface SendFnTemplateOutput { item: SendFnAdminTemplate }

export interface SendFnListDeliveriesInput extends Omit<QueryEventsParams, "startAt" | "endAt"> {
  startAt?: string;
  endAt?: string;
}
export interface SendFnDeliveryListOutput {
  items: SendFnAdminDeliveryEvent[];
  nextCursor: null;
}

export type SendFnSendEmailInput = Omit<SendEmailParams, "idempotencyKey">;
export interface SendFnSendBulkEmailInput {
  messages: Omit<SendEmailParams, "idempotencyKey">[];
}
export type SendFnSendSmsInput = SendSmsParams;
export type SendFnSendWhatsAppInput = SendWhatsAppParams;
export type SendFnSendPushInput = SendPushParams;
export interface SendFnSendBulkPushInput { messages: SendPushParams[] }
export interface SendFnEmailOutput { item: SendFnAdminEmailTransaction }
export interface SendFnEmailListOutput { items: SendFnAdminEmailTransaction[] }
export interface SendFnSmsOutput { item: SendFnAdminSmsTransaction }
export interface SendFnWhatsAppOutput { item: SendFnAdminWhatsAppTransaction }
export interface SendFnPushOutput { item: SendFnAdminPushNotification }
export interface SendFnPushListOutput { items: SendFnAdminPushNotification[] }

export interface SendFnListSuppressionsInput {
  limit?: number;
  offset?: number;
}
export interface SendFnGetSuppressionInput { email: string }
export interface SendFnAddSuppressionInput
  extends Omit<AddSuppressionParams, "suppressedAt" | "metadata"> {
  suppressedAt?: string;
  metadata?: Record<string, unknown>;
}
export interface SendFnRemoveSuppressionInput { email: string }
export interface SendFnSuppressionListOutput {
  items: SendFnAdminSuppression[];
  nextCursor: null;
}
export interface SendFnSuppressionOutput {
  suppressed: boolean;
  item: SendFnAdminSuppression | null;
}
export interface SendFnSuppressionMutationOutput {
  accepted: true;
  item?: SendFnAdminSuppression;
  email: string;
}

export interface SendFnListDeviceTokensInput {
  userId: string;
  platform?: Platform;
}
export type SendFnRegisterDeviceInput = RegisterDeviceParams;
export interface SendFnDeactivateDeviceInput { token: string }
export interface SendFnRefreshDeviceInput {
  oldToken: string;
  newToken: string;
  userId: string;
  platform: Platform;
}
export interface SendFnCleanupDevicesInput { olderThan: string }
export interface SendFnDeviceListOutput {
  items: SendFnAdminDeviceToken[];
  nextCursor: null;
}
export interface SendFnDeviceOutput { item: SendFnAdminDeviceToken }
export interface SendFnDeactivateDeviceOutput {
  accepted: true;
  deactivatedToken: string;
}
export interface SendFnCleanupDevicesOutput {
  accepted: true;
  removed: number;
  olderThan: string;
}

export interface SendFnAcceptedOutput { accepted: true }

export interface SendFnAdminService {
  listTemplates(input: SendFnListTemplatesInput, context: AdminOperationContext): Promise<SendFnTemplateListOutput>;
  getTemplate(input: SendFnGetTemplateInput, context: AdminOperationContext): Promise<SendFnTemplateOutput>;
  registerTemplate(input: SendFnRegisterTemplateInput, context: AdminOperationContext): Promise<SendFnAcceptedOutput>;
  listDeliveries(input: SendFnListDeliveriesInput, context: AdminOperationContext): Promise<SendFnDeliveryListOutput>;
  sendEmail(input: SendFnSendEmailInput, context: AdminOperationContext): Promise<SendFnEmailOutput>;
  sendBulkEmail(input: SendFnSendBulkEmailInput, context: AdminOperationContext): Promise<SendFnEmailListOutput>;
  sendSms(input: SendFnSendSmsInput, context: AdminOperationContext): Promise<SendFnSmsOutput>;
  sendWhatsApp(input: SendFnSendWhatsAppInput, context: AdminOperationContext): Promise<SendFnWhatsAppOutput>;
  sendPush(input: SendFnSendPushInput, context: AdminOperationContext): Promise<SendFnPushOutput>;
  sendBulkPush(input: SendFnSendBulkPushInput, context: AdminOperationContext): Promise<SendFnPushListOutput>;
  listSuppressions(input: SendFnListSuppressionsInput, context: AdminOperationContext): Promise<SendFnSuppressionListOutput>;
  getSuppression(input: SendFnGetSuppressionInput, context: AdminOperationContext): Promise<SendFnSuppressionOutput>;
  addSuppression(input: SendFnAddSuppressionInput, context: AdminOperationContext): Promise<SendFnSuppressionMutationOutput>;
  removeSuppression(input: SendFnRemoveSuppressionInput, context: AdminOperationContext): Promise<SendFnSuppressionMutationOutput>;
  listDeviceTokens(input: SendFnListDeviceTokensInput, context: AdminOperationContext): Promise<SendFnDeviceListOutput>;
  registerDevice(input: SendFnRegisterDeviceInput, context: AdminOperationContext): Promise<SendFnDeviceOutput>;
  deactivateDevice(input: SendFnDeactivateDeviceInput, context: AdminOperationContext): Promise<SendFnDeactivateDeviceOutput>;
  refreshDevice(input: SendFnRefreshDeviceInput, context: AdminOperationContext): Promise<SendFnDeviceOutput>;
  cleanupDevices(input: SendFnCleanupDevicesInput, context: AdminOperationContext): Promise<SendFnCleanupDevicesOutput>;
}

export interface SendFnDomainAdminServiceOptions {
  /** A project-owned SendFn client. The binding never bypasses this public API. */
  sendfn: SendfnClient;
  /** Project that owns the supplied SendFn client and database. */
  projectId: string;
}
