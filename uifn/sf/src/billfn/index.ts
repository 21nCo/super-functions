import {
  BillingPlanCards,
  InvoiceTable,
  SubscriptionStatusPanel,
  type BillingPlanRecord,
  type InvoiceRecord,
  type PatternStatus,
  type SubscriptionStatusData,
} from '@uifn/patterns';
import { resolveBackedData, withSuperfunctionBacking, type SfPatternModel } from '../shared';

export interface BillFnClient {
  listPlans: () => Promise<BillingPlanRecord[]>;
  getSubscription: () => Promise<SubscriptionStatusData>;
  listInvoices: () => Promise<InvoiceRecord[]>;
  selectPlan?: (planId: string) => Promise<void>;
  manageSubscription?: () => Promise<void>;
  cancelSubscription?: () => Promise<void>;
  downloadInvoice?: (invoiceId: string) => Promise<void>;
}

export interface BillFnBillingPlanCardsProps {
  billClient: BillFnClient;
  status?: PatternStatus;
  plans?: BillingPlanRecord[];
}

export interface BillFnSubscriptionStatusPanelProps {
  billClient: BillFnClient;
  status?: PatternStatus;
  subscription?: SubscriptionStatusData;
}

export interface BillFnInvoiceTableProps {
  billClient: BillFnClient;
  status?: PatternStatus;
  invoices?: InvoiceRecord[];
}

export async function BillFnBillingPlanCards(
  props: BillFnBillingPlanCardsProps
): Promise<SfPatternModel<BillingPlanRecord[]>> {
  const resolved = await resolveBackedData(props.status, props.plans, () => props.billClient.listPlans());
  return withSuperfunctionBacking(
    BillingPlanCards({
      status: resolved.status,
      plans: resolved.data,
      error: resolved.error,
      onSelectPlan: (planId) => void props.billClient.selectPlan?.(planId),
    }),
    {
      superfunction: 'billfn',
      controlledCounterpart: 'BillingPlanCards',
      clientContract: 'BillFnClient',
    }
  );
}

export async function BillFnSubscriptionStatusPanel(
  props: BillFnSubscriptionStatusPanelProps
): Promise<SfPatternModel<SubscriptionStatusData>> {
  const resolved = await resolveBackedData(props.status, props.subscription, () => props.billClient.getSubscription());
  return withSuperfunctionBacking(
    SubscriptionStatusPanel({
      status: resolved.status,
      data: resolved.data,
      error: resolved.error,
      onManage: () => void props.billClient.manageSubscription?.(),
      onCancel: () => void props.billClient.cancelSubscription?.(),
    }),
    {
      superfunction: 'billfn',
      controlledCounterpart: 'SubscriptionStatusPanel',
      clientContract: 'BillFnClient',
    }
  );
}

export async function BillFnInvoiceTable(props: BillFnInvoiceTableProps): Promise<SfPatternModel<InvoiceRecord[]>> {
  const resolved = await resolveBackedData(props.status, props.invoices, () => props.billClient.listInvoices());
  return withSuperfunctionBacking(
    InvoiceTable({
      status: resolved.status,
      invoices: resolved.data,
      error: resolved.error,
      onDownload: (invoiceId) => void props.billClient.downloadInvoice?.(invoiceId),
    }),
    {
      superfunction: 'billfn',
      controlledCounterpart: 'InvoiceTable',
      clientContract: 'BillFnClient',
    }
  );
}
