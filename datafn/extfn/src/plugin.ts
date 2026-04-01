import type {
  DatafnClient,
  DatafnClientConfig,
} from "@datafn/client";
import type { DatafnSchema } from "@datafn/core";
import type {
  RuntimePlugin,
} from "@superfunctions/extfn";
import {
  createDatafnExtfnAuthority,
  type CreateDatafnExtfnAuthorityOptions,
  type DatafnExtfnAuthority,
} from "./authority.js";
import {
  createDatafnExtfnProxyClient,
  type DatafnExtfnProxyClientOptions,
} from "./proxyClient.js";
import { createDatafnExtfnRoutes } from "./routes.js";
import { assertValidDatafnExtfnOptionShape } from "./shared.js";

type PublicDatafnExtfnConfig<S extends DatafnSchema> = Pick<
  DatafnClientConfig<S>,
  | "schema"
  | "clientId"
  | "namespace"
  | "sync"
  | "storage"
  | "plugins"
  | "searchProvider"
> & {
  requestTimeoutMs?: number;
};

export interface DatafnExtfnOptions<S extends DatafnSchema>
  extends PublicDatafnExtfnConfig<S> {}

export interface DatafnExtfnPlugin<S extends DatafnSchema>
  extends RuntimePlugin {
  readonly authority: DatafnExtfnAuthority<S>;
  createProxyClient(
    runtimeOptions?: DatafnExtfnProxyClientOptions,
  ): DatafnClient<S>;
}

export interface DatafnExtfnPluginInit<S extends DatafnSchema> {
  authority?: DatafnExtfnAuthority<S>;
  authorityOptions?: CreateDatafnExtfnAuthorityOptions<S>;
}

export function assertValidDatafnExtfnOptions<S extends DatafnSchema>(
  options: DatafnExtfnOptions<S>,
): void {
  assertValidDatafnExtfnOptionShape(options as unknown);
}

export function datafnExtfn<S extends DatafnSchema>(
  options: DatafnExtfnOptions<S>,
  init: DatafnExtfnPluginInit<S> = {},
): DatafnExtfnPlugin<S> {
  assertValidDatafnExtfnOptions(options);
  const authority =
    init.authority ??
    createDatafnExtfnAuthority(options, init.authorityOptions);

  return {
    id: "datafn-extfn",
    registerBackgroundHandlers() {
      return createDatafnExtfnRoutes(authority);
    },
    get authority() {
      return authority;
    },
    createProxyClient(runtimeOptions) {
      return createDatafnExtfnProxyClient(options, runtimeOptions);
    },
  };
}
