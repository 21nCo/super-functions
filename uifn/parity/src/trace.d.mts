export function createPhase14Scheduler(): any;
export function createPhase14HarnessRuntime(vector: any): any;
export function phase14PartProps(vector: any, part: any): Record<string, unknown>;
export function capturePhase14Checkpoint(token: string, checkpoint: string, bridge: any, sequence: number): any;
export function runPhase14Actions(vector: any, bridge: any, runtime: any, capture: (checkpoint: string, sequence: number) => any): Promise<any>;
export function capturePhase14Cleanup(token: string, bridge: any, scheduler: any): any;
export function assemblePhase14Trace(input: any): any;
export const phase14TraceMarkers: Readonly<{ run: string; part: string; instance: string }>;
