/**
 * @apifn/docsfn — public API
 *
 * Provides a DocsContentProvider and API reference renderer components
 * for embedding ApiFn API documentation in docsfn sites.
 */

// Provider
export { createApifnProvider } from "./provider.js";

// Types
export type {
    DocsContentProvider,
    RawContentEntry,
    ApiEndpoint,
    SidebarItem,
    SidebarLink,
    SidebarGroup,
    CreateApifnProviderOptions,
    ApifnApiReferenceProps,
    OpenAPIDocument,
    OperationObject,
} from "./types.js";
