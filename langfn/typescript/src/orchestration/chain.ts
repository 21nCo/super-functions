import { InternalError, ValidationError } from "../core/errors.js";
import { runParallelOrdered, type ParallelOptions } from "./parallel.js";

export type Step<TIn, TOut> = (input: TIn) => Promise<TOut> | TOut;

export interface MapReduceOptions<TInput, TMapped, TReduced> extends ParallelOptions {
  map: (input: TInput, index: number) => Promise<TMapped> | TMapped;
  reduce: (inputs: TMapped[]) => Promise<TReduced> | TReduced;
}

export interface RouterOptions<TInput, TOutput> {
  routes: Record<string, Step<TInput, TOutput>>;
  router: (input: TInput) => Promise<string> | string;
}

export class Chain<TIn, TOut> {
  constructor(private readonly runHandler: (input: TIn) => Promise<TOut>) {}

  async run(input: TIn): Promise<TOut> {
    return await this.runHandler(input);
  }

  static sequential(steps: Array<Step<any, any>>): Chain<any, any> {
    return new Chain(async (input: unknown) => {
      let current = input;
      for (const step of steps) {
        current = await step(current);
      }
      return current;
    });
  }

  static parallel<T>(steps: Array<Step<T, unknown>>, options: ParallelOptions = {}): Chain<T, unknown[]> {
    return new Chain(async (input: T) => await runParallelOrdered(steps, input, options));
  }

  static mapReduce<TInput, TMapped, TReduced>(
    options: MapReduceOptions<TInput, TMapped, TReduced>
  ): Chain<TInput[], TReduced> {
    return new Chain(async (inputs: TInput[]) => {
      const mapped = await runParallelOrdered(
        inputs.map((value, index) => () => options.map(value, index)),
        undefined,
        options
      );
      return await options.reduce(mapped as TMapped[]);
    });
  }

  static router<TInput, TOutput>(options: RouterOptions<TInput, TOutput>): Chain<TInput, TOutput> {
    return new Chain(async (input: TInput) => {
      let key: string;
      try {
        key = await options.router(input);
      } catch (error) {
        throw new InternalError("Router failed to select a route", { cause: error });
      }
      const handler = Object.hasOwn(options.routes, key) ? options.routes[key] : undefined;
      if (typeof handler !== "function") {
        throw new ValidationError(`Unknown route: ${key}`, { metadata: { route: key } });
      }
      return await handler(input);
    });
  }
}
