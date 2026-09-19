import { Chain, type RouterOptions } from "./chain.js";

export function createRouterChain<TInput, TOutput>(options: RouterOptions<TInput, TOutput>): Chain<TInput, TOutput> {
  return Chain.router(options);
}
