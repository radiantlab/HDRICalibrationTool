/**
 * The channel the pipeline reports progress on.
 *
 * The pipeline used to be a Rust command, so status crossed a process boundary
 * and Tauri's event system was the only way across. It runs in the page now,
 * on the same side as the UI listening to it, so the events no longer need to
 * leave the page at all.
 *
 * Kept as an event channel rather than collapsed into a callback because the
 * listener is a React context mounted independently of whatever starts a run,
 * and there may be several. An `EventTarget` is what Tauri's API was standing
 * in for, and it works identically in both hosts, so this replaces the Tauri
 * events outright rather than branching on the host.
 */

const channel = new EventTarget();

export type PipelineEventName =
  | "pipeline-output"
  | "pipeline-progress"
  | "pipeline-status";

export function emitPipelineEvent(
  name: PipelineEventName,
  payload: unknown
): void {
  channel.dispatchEvent(new CustomEvent(name, { detail: payload }));
}

/** Returns an unsubscribe function, matching what Tauri's `listen` resolved to. */
export function onPipelineEvent(
  name: PipelineEventName,
  handler: (payload: unknown) => void
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent).detail);
  };
  channel.addEventListener(name, listener);
  return () => channel.removeEventListener(name, listener);
}
