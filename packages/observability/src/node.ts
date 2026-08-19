import { AsyncLocalStorage } from "node:async_hooks";
import type {
  ObservationEvent,
  RequestObservation,
  RequestObservationContext,
} from "./index.js";

export function createAsyncLocalRequestContext<
  TEvent extends ObservationEvent = ObservationEvent,
>(): RequestObservationContext<TEvent> {
  const storage = new AsyncLocalStorage<RequestObservation<TEvent>>();
  return {
    async run<T>(
      observation: RequestObservation<TEvent>,
      work: () => T | Promise<T>,
    ): Promise<T> {
      return await storage.run(observation, work);
    },
    get(): RequestObservation<TEvent> | undefined {
      return storage.getStore();
    },
  };
}
