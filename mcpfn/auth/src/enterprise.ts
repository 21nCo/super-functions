export const MCP_ENTERPRISE_MANAGED_AUTHORIZATION_EXTENSION_ID =
  "io.modelcontextprotocol/enterprise-managed-authorization";

export const MCP_ID_JAG_GRANT_PROFILE =
  "urn:ietf:params:oauth:grant-profile:id-jag";

export interface McpFnAuthorizationServerMetadata extends Record<string, unknown> {
  authorization_grant_profiles_supported?: string[];
}

/** Adds the stable ID-JAG discovery marker to authorization-server metadata. */
export function withEnterpriseManagedAuthorization<T extends McpFnAuthorizationServerMetadata>(
  metadata: T,
): T & { authorization_grant_profiles_supported: string[] } {
  return {
    ...metadata,
    authorization_grant_profiles_supported: [
      ...new Set([
        ...(metadata.authorization_grant_profiles_supported ?? []),
        MCP_ID_JAG_GRANT_PROFILE,
      ]),
    ],
  };
}

/** Metadata clients attach to requests when declaring extension support. */
export function enterpriseManagedAuthorizationClientMetadata(): Record<string, unknown> {
  return {
    "io.modelcontextprotocol/clientCapabilities": {
      extensions: {
        [MCP_ENTERPRISE_MANAGED_AUTHORIZATION_EXTENSION_ID]: {},
      },
    },
  };
}
