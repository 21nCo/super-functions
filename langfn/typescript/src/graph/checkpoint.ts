export interface GraphCheckpoint<TState> {
  id: string;
  node: string;
  state: TState;
  steps: number;
}

export interface CheckpointStore<TState> {
  /** Atomically consume a checkpoint before running side effects. Required for resume. */
  take?(id: string): Promise<GraphCheckpoint<TState> | undefined> | GraphCheckpoint<TState> | undefined;
  remove?(id: string): Promise<void> | void;
  save(checkpoint: GraphCheckpoint<TState>): Promise<void> | void;
  load(id: string): Promise<GraphCheckpoint<TState> | undefined> | GraphCheckpoint<TState> | undefined;
}

export class InMemoryCheckpointStore<TState> implements CheckpointStore<TState> {
  private readonly checkpoints = new Map<string, GraphCheckpoint<TState>>();

  constructor(private readonly maxEntries = 1000) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error("Invalid checkpoint capacity");
  }

  async take(id: string): Promise<GraphCheckpoint<TState> | undefined> {
    const checkpoint = this.checkpoints.get(id);
    this.checkpoints.delete(id);
    return checkpoint;
  }

  async remove(id: string): Promise<void> { this.checkpoints.delete(id); }

  async save(checkpoint: GraphCheckpoint<TState>): Promise<void> {
    this.checkpoints.delete(checkpoint.id);
    this.checkpoints.set(checkpoint.id, checkpoint);
    if (this.checkpoints.size > this.maxEntries) this.checkpoints.delete(this.checkpoints.keys().next().value!);
  }

  async load(id: string): Promise<GraphCheckpoint<TState> | undefined> {
    return this.checkpoints.get(id);
  }
}
