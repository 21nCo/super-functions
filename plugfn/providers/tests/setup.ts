import { vi } from "vitest";

vi.mock("imapflow", () => ({
  ImapFlow: vi.fn(function ImapFlowMock(this: {
    connect: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }) {
    this.connect = vi.fn().mockResolvedValue(undefined);
    this.close = vi.fn();
  }),
}));
