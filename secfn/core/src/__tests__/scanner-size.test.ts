import { expect, it, vi } from "vitest";
import { open } from "node:fs/promises";
import { createSecurityScanner } from "../scanner/scanner.js";
vi.mock("node:fs/promises", () => ({ open: vi.fn() }));
it("bounds reads even for growing files and closes the handle", async () => {
  const read = vi.fn(
    async (_buffer: Buffer, _offset: number, length: number) => ({
      bytesRead: Math.min(3, length),
    }),
  );
  const close = vi.fn(async () => {});
  vi.mocked(open).mockResolvedValue({ read, close } as any);
  expect(
    await createSecurityScanner({ maxFileSize: 10 }).scanFile("growing"),
  ).toEqual([]);
  expect(read.mock.calls.reduce((n, call) => n + Math.min(3, call[2]), 0)).toBe(
    11,
  );
  expect(read.mock.calls[0][0].length).toBe(11);
  expect(close).toHaveBeenCalledOnce();
});
it("closes the handle after a read error", async () => {
  const close = vi.fn(async () => {});
  vi.mocked(open).mockResolvedValue({
    read: async () => {
      throw new Error("read failed");
    },
    close,
  } as any);
  await expect(createSecurityScanner().scanFile("bad")).rejects.toThrow(
    "read failed",
  );
  expect(close).toHaveBeenCalledOnce();
});
