import { GraphInterruptError, GraphMaxStepsError, InternalError, ValidationError } from "../core/errors.js";
import { InMemoryCheckpointStore, type CheckpointStore, type GraphCheckpoint } from "./checkpoint.js";

export const END = "__end__";

export type NodeFn<TState> = (state: TState) => Promise<TState> | TState;
export type RouteFn<TState> = (state: TState) => Promise<string> | string;

export interface InvokeGraphOptions<TState> {
  maxSteps?: number;
  checkpointStore?: CheckpointStore<TState>;
}

export class CompiledGraph<TState extends Record<string, unknown>> {
  private readonly checkpointStore = new InMemoryCheckpointStore<TState>();

  constructor(
    private readonly config: {
      initialState: TState;
      nodes: Map<string, NodeFn<TState>>;
      edges: Map<string, string>;
      conditionalEdges: Map<string, RouteFn<TState>>;
      interruptBefore: Set<string>;
      entrypoint: string;
    }
  ) {}

  async invoke(state?: Partial<TState>, options: InvokeGraphOptions<TState> = {}): Promise<TState> {
    return await this.run({
      checkpointStore: options.checkpointStore ?? this.checkpointStore,
      currentNode: this.config.entrypoint,
      currentState: { ...this.config.initialState, ...(state ?? {}) } as TState,
      executedSteps: 0,
      maxSteps: options.maxSteps ?? 100
    });
  }

  async resume(checkpointId: string, options: InvokeGraphOptions<TState> = {}): Promise<TState> {
    const store = options.checkpointStore ?? this.checkpointStore;
    if (!store.take) throw new ValidationError("Checkpoint store must support atomic take() to resume safely");
    const checkpoint = await store.take(checkpointId);
    if (!checkpoint) {
      throw new ValidationError(`Unknown checkpoint: ${checkpointId}`, { metadata: { checkpointId } });
    }
    return await this.run({
      checkpointStore: store,
      currentNode: checkpoint.node,
      currentState: checkpoint.state,
      executedSteps: checkpoint.steps,
      maxSteps: options.maxSteps ?? 100,
      skipInterruptFor: checkpoint.node
    });
  }

  private async run(options: {
    checkpointStore?: CheckpointStore<TState>;
    currentNode: string;
    currentState: TState;
    executedSteps: number;
    maxSteps: number;
    skipInterruptFor?: string;
  }): Promise<TState> {
    let currentNode = options.currentNode;
    let currentState = options.currentState;
    let executedSteps = options.executedSteps;
    let skipInterruptFor = options.skipInterruptFor;
    const store = options.checkpointStore;

    while (true) {
      if (executedSteps >= options.maxSteps) {
        throw new GraphMaxStepsError("Graph exceeded max steps", {
          metadata: { node: currentNode, maxSteps: options.maxSteps }
        });
      }

      if (this.config.interruptBefore.has(currentNode) && skipInterruptFor !== currentNode) {
        const checkpointId = await this.saveCheckpoint(store, {
          id: randomCheckpointId(),
          node: currentNode,
          state: currentState,
          steps: executedSteps
        });
        throw new GraphInterruptError("Graph interrupted before node execution", {
          metadata: { checkpointId, node: currentNode }
        });
      }
      skipInterruptFor = undefined;

      const node = this.config.nodes.get(currentNode);
      if (!node) {
        throw new InternalError(`Unknown graph node: ${currentNode}`, { metadata: { node: currentNode } });
      }

      try {
        currentState = await node(currentState);
      } catch (error) {
        if (error instanceof Error && "code" in error) {
          throw error;
        }
        throw new InternalError(`Graph node '${currentNode}' failed`, {
          metadata: { node: currentNode },
          cause: error
        });
      }
      executedSteps += 1;

      const router = this.config.conditionalEdges.get(currentNode);
      let nextNode: string | undefined;
      if (router) {
        try {
          nextNode = await router(currentState);
        } catch (error) {
          throw new InternalError(`Conditional edge '${currentNode}' failed`, {
            metadata: { node: currentNode },
            cause: error
          });
        }
      } else {
        nextNode = this.config.edges.get(currentNode);
      }

      if (!nextNode || nextNode === END) {
        return currentState;
      }
      if (!this.config.nodes.has(nextNode)) {
        throw new InternalError(`Unknown graph node: ${nextNode}`, { metadata: { node: nextNode } });
      }
      currentNode = nextNode;
    }
  }

  private async saveCheckpoint(
    store: CheckpointStore<TState> | undefined,
    checkpoint: GraphCheckpoint<TState>
  ): Promise<string> {
    if (!store) {
      return checkpoint.id;
    }
    await store.save(checkpoint);
    return checkpoint.id;
  }
}

export class StateGraph<TState extends Record<string, unknown>> {
  private readonly nodes = new Map<string, NodeFn<TState>>();
  private readonly edges = new Map<string, string>();
  private readonly conditionalEdges = new Map<string, RouteFn<TState>>();
  private readonly interruptBefore = new Set<string>();
  private entrypoint?: string;

  constructor(private readonly initialState: TState) {}

  addNode(name: string, fn: NodeFn<TState>): this {
    if (this.nodes.has(name)) {
      throw new ValidationError(`Node already exists: ${name}`, { metadata: { node: name } });
    }
    this.nodes.set(name, fn);
    return this;
  }

  addEdge(from: string, to: string): this {
    this.edges.set(from, to);
    return this;
  }

  addConditionalEdge(from: string, router: RouteFn<TState>): this {
    this.conditionalEdges.set(from, router);
    return this;
  }

  addInterrupt(node: string): this {
    this.interruptBefore.add(node);
    return this;
  }

  setEntryPoint(name: string): this {
    this.entrypoint = name;
    return this;
  }

  compile(): CompiledGraph<TState> {
    if (!this.entrypoint) {
      throw new ValidationError("Entrypoint not set");
    }
    if (!this.nodes.has(this.entrypoint)) {
      throw new ValidationError(`Entry point node not found: ${this.entrypoint}`, {
        metadata: { node: this.entrypoint }
      });
    }
    return new CompiledGraph({
      initialState: { ...this.initialState },
      nodes: this.nodes,
      edges: this.edges,
      conditionalEdges: this.conditionalEdges,
      interruptBefore: this.interruptBefore,
      entrypoint: this.entrypoint
    });
  }
}

function randomCheckpointId(): string {
  return `chk_${crypto.randomUUID()}`;
}
