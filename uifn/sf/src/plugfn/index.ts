import {
  OAuthConnectionsPanel,
  ProviderPicker,
  WebhookEndpointTable,
  type OAuthConnectionRecord,
  type PatternStatus,
  type ProviderRecord,
  type WebhookEndpointRecord,
} from '@uifn/patterns';
import { resolveBackedData, withSuperfunctionBacking, type SfPatternModel } from '../shared';

export interface PlugFnClient {
  listProviders: () => Promise<ProviderRecord[]>;
  listConnections: () => Promise<OAuthConnectionRecord[]>;
  listWebhookEndpoints: () => Promise<WebhookEndpointRecord[]>;
  connectProvider?: (providerId: string) => Promise<void>;
  disconnectConnection?: (connectionId: string) => Promise<void>;
  createWebhookEndpoint?: () => Promise<WebhookEndpointRecord>;
  rotateWebhookSecret?: (endpointId: string) => Promise<void>;
  deleteWebhookEndpoint?: (endpointId: string) => Promise<void>;
}

export interface PlugFnProviderPickerProps {
  plugClient: PlugFnClient;
  status?: PatternStatus;
  providers?: ProviderRecord[];
}

export interface PlugFnOAuthConnectionsPanelProps {
  plugClient: PlugFnClient;
  status?: PatternStatus;
  connections?: OAuthConnectionRecord[];
}

export interface PlugFnWebhookEndpointTableProps {
  plugClient: PlugFnClient;
  status?: PatternStatus;
  endpoints?: WebhookEndpointRecord[];
}

export async function PlugFnProviderPicker(
  props: PlugFnProviderPickerProps
): Promise<SfPatternModel<ProviderRecord[]>> {
  const resolved = await resolveBackedData(props.status, props.providers, () => props.plugClient.listProviders());
  return withSuperfunctionBacking(
    ProviderPicker({
      status: resolved.status,
      providers: resolved.data,
      error: resolved.error,
      onSelect: (providerId) => void props.plugClient.connectProvider?.(providerId),
    }),
    {
      superfunction: 'plugfn',
      controlledCounterpart: 'ProviderPicker',
      clientContract: 'PlugFnClient',
    }
  );
}

export async function PlugFnOAuthConnectionsPanel(
  props: PlugFnOAuthConnectionsPanelProps
): Promise<SfPatternModel<OAuthConnectionRecord[]>> {
  const resolved = await resolveBackedData(props.status, props.connections, () => props.plugClient.listConnections());
  return withSuperfunctionBacking(
    OAuthConnectionsPanel({
      status: resolved.status,
      connections: resolved.data,
      error: resolved.error,
      onConnect: (providerId) => void props.plugClient.connectProvider?.(providerId),
      onDisconnect: (connectionId) => void props.plugClient.disconnectConnection?.(connectionId),
    }),
    {
      superfunction: 'plugfn',
      controlledCounterpart: 'OAuthConnectionsPanel',
      clientContract: 'PlugFnClient',
    }
  );
}

export async function PlugFnWebhookEndpointTable(
  props: PlugFnWebhookEndpointTableProps
): Promise<SfPatternModel<WebhookEndpointRecord[]>> {
  const resolved = await resolveBackedData(props.status, props.endpoints, () => props.plugClient.listWebhookEndpoints());
  return withSuperfunctionBacking(
    WebhookEndpointTable({
      status: resolved.status,
      endpoints: resolved.data,
      error: resolved.error,
      onCreate: () => void props.plugClient.createWebhookEndpoint?.(),
      onRotateSecret: (endpointId) => void props.plugClient.rotateWebhookSecret?.(endpointId),
      onDelete: (endpointId) => void props.plugClient.deleteWebhookEndpoint?.(endpointId),
    }),
    {
      superfunction: 'plugfn',
      controlledCounterpart: 'WebhookEndpointTable',
      clientContract: 'PlugFnClient',
    }
  );
}
