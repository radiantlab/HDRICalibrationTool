import type { ImageSet } from "@/components/ui/image-set-preview";

/** Where a set sits in the batch. `position` is 1-based, as shown to the user. */
export interface SetPosition {
  position: number;
  set: ImageSet;
  total: number;
}

export interface BatchSummary {
  failed: number;
  /** Sets that were never begun, because stopping was requested first. */
  skipped: number;
  succeeded: number;
  total: number;
}

/**
 * Runs each image set in turn, reporting what happened to each.
 *
 * Deliberately free of React and Tauri. The risk in batching is control flow,
 * not wiring: whether a failure stops the queue, whether Stop takes effect at
 * the right boundary, whether a single set still behaves exactly as it did
 * before. Keeping that here makes each of those a unit test rather than
 * something only reproducible with ten real directories and a twenty-minute
 * run.
 *
 * `runSet` is expected to report a set's own outcome, since only the caller
 * knows how to record and display one. Throwing is how it says the set failed;
 * the queue carries on either way.
 *
 * `shouldStop` is read between sets and never during one. Cancelling a set in
 * flight would mean killing Radiance and hdrgen child processes, which is a
 * separate piece of work; stopping at a boundary is what makes an overnight
 * batch recoverable without discarding what it already produced.
 */
export async function runBatch({
  onBeginSet,
  runSet,
  sets,
  shouldStop,
}: {
  onBeginSet?: (at: SetPosition) => void;
  runSet: (at: SetPosition) => Promise<void>;
  sets: ImageSet[];
  shouldStop?: () => boolean;
}): Promise<BatchSummary> {
  let failed = 0;
  let started = 0;
  let succeeded = 0;

  // Array.from(...) rather than iterating sets.entries() directly: this
  // project's tsconfig targets es5, and a bare ArrayIterator needs
  // --downlevelIteration to be consumed by for-of.
  for (const [index, set] of Array.from(sets.entries())) {
    if (shouldStop?.()) {
      break;
    }

    const at: SetPosition = { position: index + 1, set, total: sets.length };
    started += 1;
    onBeginSet?.(at);

    try {
      // biome-ignore lint/performance/noAwaitInLoops: the sets must run one at a time. They share the pipeline's tmp directory and compete for the same external binaries, and running them concurrently would interleave the progress and log events the console reports.
      await runSet(at);
      succeeded += 1;
    } catch {
      // The error itself is the caller's to report, against the set it belongs
      // to. All that is decided here is that the queue continues.
      failed += 1;
    }
  }

  return {
    failed,
    skipped: sets.length - started,
    succeeded,
    total: sets.length,
  };
}
