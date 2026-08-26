declare global {
  namespace App {
    interface Error {
      code?: string;
      details?: Record<string, unknown>;
    }

    interface Locals {
      requestId?: string;
    }
  }
}

export {};
