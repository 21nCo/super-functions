import {
  createAdminCapabilityAdapter as createKernelAdminCapabilityAdapter,
  type AdminCapabilityAdapter,
  type AdminOperationContext,
  type AdminOperationRequest,
} from "@superfunctions/admin";
import { sendFnAdminCapability } from "./capability.js";
import type { SendFnAdminService } from "./types.js";

function bind<TInput, TOutput>(
  handler: (input: TInput, context: AdminOperationContext) => Promise<TOutput>,
) {
  return ({ input, context }: AdminOperationRequest) => handler(input as TInput, context);
}

/** Maps every manifest operation to one explicit, typed SendFn admin method. */
export function createSendFnAdminAdapter(
  service: SendFnAdminService,
): AdminCapabilityAdapter<typeof sendFnAdminCapability> {
  return createKernelAdminCapabilityAdapter(sendFnAdminCapability, {
    "sendfn.templates.list": bind(service.listTemplates),
    "sendfn.templates.get": bind(service.getTemplate),
    "sendfn.templates.register": bind(service.registerTemplate),
    "sendfn.deliveries.list": bind(service.listDeliveries),
    "sendfn.messages.send-email": bind(service.sendEmail),
    "sendfn.messages.send-email-bulk": bind(service.sendBulkEmail),
    "sendfn.messages.send-sms": bind(service.sendSms),
    "sendfn.messages.send-whatsapp": bind(service.sendWhatsApp),
    "sendfn.messages.send-push": bind(service.sendPush),
    "sendfn.messages.send-push-bulk": bind(service.sendBulkPush),
    "sendfn.suppressions.list": bind(service.listSuppressions),
    "sendfn.suppressions.get": bind(service.getSuppression),
    "sendfn.suppressions.add": bind(service.addSuppression),
    "sendfn.suppressions.remove": bind(service.removeSuppression),
    "sendfn.device-tokens.list": bind(service.listDeviceTokens),
    "sendfn.device-tokens.register": bind(service.registerDevice),
    "sendfn.device-tokens.deactivate": bind(service.deactivateDevice),
    "sendfn.device-tokens.refresh": bind(service.refreshDevice),
    "sendfn.device-tokens.cleanup": bind(service.cleanupDevices),
  });
}

export const createAdminAdapter = createSendFnAdminAdapter;
