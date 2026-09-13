export interface GraphCheckpoint<TState> {
  id: string;
  node: string;
  state: TState;
  steps: number;
}

export interface CheckpointStore<TState> {
  save(checkpoint: GraphCheckpoint<TState>): Promise<void> | void;
  load(id: string): Promise<GraphCheckpoint<TState> | undefined> | GraphCheckpoint<TState> | undefined;
}

export class InMemoryCheckpointStore<TState> implements CheckpointStore<TState> {
  private readonly checkpoints = new Map<string, GraphCheckpoint<TState>>();

  async save(checkpoint: GraphCheckpoint<TState>): Promise<void> {
    this.checkpoints.set(checkpoint.id, checkpoint);
  }

  async load(id: string): Promise<GraphCheckpoint<TState> | undefined> {
    return this.checkpoints.get(id);
  }
}
