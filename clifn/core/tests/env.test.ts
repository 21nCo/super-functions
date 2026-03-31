import {
  readBooleanEnv,
  readIntEnv,
  readRequiredStringEnv,
  readStringEnv,
} from "../src/env.js";

function captureThrownError(fn: () => unknown): { code?: string; message: string } {
  try {
    fn();
  } catch (error) {
    return {
      code: (error as { code?: string }).code,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  throw new Error("Expected function to throw");
}

describe("env readers", () => {
  it("reads required strings explicitly", () => {
    const value = readRequiredStringEnv("TOKEN", {
      env: {
        TOKEN: "abc123",
      },
    });

    expect(value).toBe("abc123");
  });

  it("fails with an explicit code when a required value is missing", () => {
    expect(
      captureThrownError(() =>
        readRequiredStringEnv("TOKEN", {
          env: {},
        })
      )
    ).toEqual({
      code: "CLIFN_ENV_MISSING",
      message: "TOKEN is required",
    });
  });

  it("supports optional string defaults", () => {
    const value = readStringEnv("PROFILE", {
      defaultValue: "default",
      env: {},
    });

    expect(value).toBe("default");
  });

  it("enforces integer bounds", () => {
    expect(
      readIntEnv("PORT", {
        env: { PORT: "3000" },
        min: 1024,
        max: 65535,
      })
    ).toBe(3000);

    expect(
      captureThrownError(() =>
        readIntEnv("PORT", {
          env: { PORT: "hello" },
        })
      )
    ).toEqual({
      code: "CLIFN_ENV_INVALID",
      message: "PORT must be an integer",
    });

    expect(
      captureThrownError(() =>
        readIntEnv("PORT", {
          env: { PORT: "80" },
          min: 1024,
        })
      )
    ).toEqual({
      code: "CLIFN_ENV_OUT_OF_RANGE",
      message: "PORT must be >= 1024",
    });

    expect(
      captureThrownError(() =>
        readIntEnv("PORT", {
          env: {},
          defaultValue: 3.14,
        })
      )
    ).toEqual({
      code: "CLIFN_ENV_INVALID",
      message: "PORT must be an integer",
    });
  });

  it("parses common boolean env spellings consistently", () => {
    expect(
      readBooleanEnv("VERBOSE", {
        env: { VERBOSE: "true" },
      })
    ).toBe(true);
    expect(
      readBooleanEnv("VERBOSE", {
        env: { VERBOSE: "1" },
      })
    ).toBe(true);
    expect(
      readBooleanEnv("VERBOSE", {
        env: { VERBOSE: "yes" },
      })
    ).toBe(true);
    expect(
      readBooleanEnv("VERBOSE", {
        env: { VERBOSE: "false" },
      })
    ).toBe(false);
    expect(
      readBooleanEnv("VERBOSE", {
        env: { VERBOSE: "0" },
      })
    ).toBe(false);
    expect(
      readBooleanEnv("VERBOSE", {
        env: { VERBOSE: "no" },
      })
    ).toBe(false);

    expect(
      captureThrownError(() =>
        readBooleanEnv("VERBOSE", {
          env: { VERBOSE: "maybe" },
        })
      )
    ).toEqual({
      code: "CLIFN_ENV_INVALID",
      message: "VERBOSE must be a boolean-like value",
    });
  });
});
