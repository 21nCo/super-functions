export type DatafnSignalCacheOptions = {
  idleTtlMs?: number;
  keepAlive?: boolean;
};

export type DatafnSignalOptions = {
  disableOptimistic?: boolean;
  cache?: DatafnSignalCacheOptions;
};
