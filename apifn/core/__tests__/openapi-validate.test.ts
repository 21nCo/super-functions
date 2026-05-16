import { validateOpenAPI } from "../src/index.js";

describe("validateOpenAPI", () => {
  it("TV-OPENAPI-012: valid document returns empty errors", async () => {
    const doc = {
      openapi: "3.1.0" as const,
      info: { title: "Valid API", version: "1.0.0" },
      paths: {
        "/health": {
          get: {
            responses: {
              "200": { description: "OK" },
            },
          },
        },
      },
    };

    await expect(validateOpenAPI(doc)).resolves.toEqual([]);
  });

  it("TV-OPENAPI-012: invalid document returns errors with path/message", async () => {
    const invalidDoc = {
      openapi: "3.1.0" as const,
      info: { version: "1.0.0" },
      paths: {},
    } as unknown as Parameters<typeof validateOpenAPI>[0];

    const errors = await validateOpenAPI(invalidDoc);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.path).toBeTruthy();
    expect(errors[0]?.message).toBeTruthy();
    expect(errors[0]?.severity).toBe("error");
  });
});
