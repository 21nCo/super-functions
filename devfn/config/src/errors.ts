export type ConfigErrorCode =
  | "DEVFN_CONFIG_INVALID"
  | "DEVFN_CONFIG_NOT_FOUND"
  | "DEVFN_CONFIG_PATH_ESCAPE";

export class DevFnConfigError extends Error {
  public readonly code: ConfigErrorCode;
  public readonly path?: string;

  public constructor(code: ConfigErrorCode, message: string, path?: string) {
    super(message);
    this.name = "DevFnConfigError";
    this.code = code;
    this.path = path;
  }
}
