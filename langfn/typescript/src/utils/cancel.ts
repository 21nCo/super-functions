export class CancellationToken {
  private readonly controller = new AbortController();

  cancel(): void {
    this.controller.abort();
  }

  get cancelled(): boolean {
    return this.controller.signal.aborted;
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  async wait(): Promise<void> {
    if (this.controller.signal.aborted) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.controller.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  }
}
