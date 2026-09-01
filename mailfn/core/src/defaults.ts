import type { ProjectQuota, PublicPlatformPolicy, RetentionPolicy } from './types.js';

export const DEFAULT_STABLE_RETENTION: RetentionPolicy = Object.freeze({
  messageTtlSeconds: 30 * 24 * 60 * 60,
  rawTtlSeconds: 14 * 24 * 60 * 60,
  attachmentTtlSeconds: 14 * 24 * 60 * 60,
  auditTtlSeconds: 365 * 24 * 60 * 60,
  deleteOnInboxExpiry: false,
});

export const DEFAULT_EXPIRING_RETENTION: RetentionPolicy = Object.freeze({
  messageTtlSeconds: 24 * 60 * 60,
  rawTtlSeconds: 24 * 60 * 60,
  attachmentTtlSeconds: 24 * 60 * 60,
  auditTtlSeconds: 90 * 24 * 60 * 60,
  deleteOnInboxExpiry: true,
});

export const DEFAULT_PROJECT_QUOTA: ProjectQuota = Object.freeze({
  maxActiveInboxes: 1_000,
  maxMessagesPerHour: 10_000,
  maxMessagesPerInboxPerHour: 1_000,
  maxMessagesPerSenderPerHour: 500,
  maxMessageBytes: 25 * 1024 * 1024,
  maxAttachmentBytes: 20 * 1024 * 1024,
  maxStoredBytes: 10 * 1024 * 1024 * 1024,
  maxWebhooks: 100,
  maxDomains: 20,
  maxOutboundPerDay: 1_000,
});

export const DEFAULT_PUBLIC_PLATFORM_POLICY: PublicPlatformPolicy = Object.freeze({
  enabled: false,
  productionSecurityApproved: false,
  billingEnabled: false,
  supportEnabled: false,
  protocolServicesEnabled: false,
  allowedDataRegions: ['global'],
  verifiedDomainsRequiredForOutbound: true,
});
