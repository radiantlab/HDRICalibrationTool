import { describe, expect, it } from "@jest/globals";
import { act, render, screen } from "@testing-library/react";
import {
  emitPipelineEvent,
  type PipelineEventName,
} from "../src/lib/host/events";
import {
  PipelineStatusProvider,
  usePipelineStatus,
} from "../src/app/pipeline-status-context";

/**
 * Status events used to cross a process boundary from the Rust pipeline, so
 * this had to mock Tauri's `listen` and capture the handler. The pipeline runs
 * in the page now and the channel is a plain EventTarget, so the test drives
 * the real one -- which also means it would catch the provider failing to
 * subscribe at all, where mocking the transport could not.
 */

function LogView() {
  const { log } = usePipelineStatus();
  return (
    <ul>
      {log.map((entry) => (
        <li key={`${entry.at}-${entry.message}`}>{entry.message}</li>
      ))}
    </ul>
  );
}

function BatchView() {
  const { beginSet, log, progress, setIndex, setTotal, statusText } =
    usePipelineStatus();
  return (
    <div>
      <button onClick={() => beginSet(2, 3, "kitchen")} type="button">
        begin
      </button>
      <p data-testid="position">
        {setIndex} of {setTotal}
      </p>
      <p data-testid="progress">{progress}</p>
      <p data-testid="status">{statusText}</p>
      <ul>
        {log.map((entry) => (
          <li key={`${entry.at}-${entry.message}`}>{entry.message}</li>
        ))}
      </ul>
    </div>
  );
}

function emit(name: string, payload: unknown) {
  emitPipelineEvent(name as PipelineEventName, payload);
}

async function renderProvider() {
  await act(() => {
    render(
      <PipelineStatusProvider>
        <LogView />
      </PipelineStatusProvider>
    );
    return Promise.resolve();
  });
}

describe("pipeline status log", () => {
  it("keeps every message instead of overwriting", async () => {
    await renderProvider();

    act(() => {
      emit("pipeline-status", { kind: "step", message: "Merging exposures" });
      emit("pipeline-status", { kind: "step", message: "Cropping HDR image" });
    });

    expect(screen.getByText("Merging exposures")).toBeInTheDocument();
    expect(screen.getByText("Cropping HDR image")).toBeInTheDocument();
  });

  it("records warnings so they can be marked", async () => {
    await renderProvider();

    act(() => {
      emit("pipeline-status", {
        kind: "warning",
        message: "vignetting.cal is fixed size",
      });
    });

    expect(
      screen.getByText("vignetting.cal is fixed size")
    ).toBeInTheDocument();
  });

  it("does not log progress-only events", async () => {
    await renderProvider();

    act(() => {
      emit("pipeline-status", { kind: "progress", progress: 40 });
    });

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("beginning a set", () => {
  async function renderBatch() {
    await act(() => {
      render(
        <PipelineStatusProvider>
          <BatchView />
        </PipelineStatusProvider>
      );
      return Promise.resolve();
    });
  }

  it("records the set's position in the batch", async () => {
    await renderBatch();

    act(() => {
      screen.getByRole("button", { name: "begin" }).click();
    });

    expect(screen.getByTestId("position")).toHaveTextContent("2 of 3");
    expect(screen.getByRole("listitem")).toHaveTextContent(
      "Processing set 2 of 3: kitchen"
    );
    expect(screen.getByTestId("status")).toHaveTextContent(
      "Processing set 2 of 3: kitchen"
    );
  });

  // Rust emits a Done event at 100 percent at the end of every set, so without
  // this the bar would sit full for the whole of the next set.
  it("returns the bar to zero for the new set", async () => {
    await renderBatch();

    act(() => {
      emit("pipeline-status", {
        kind: "done",
        message: "done",
        progress: 100,
      });
    });
    expect(screen.getByTestId("progress")).toHaveTextContent("100");

    act(() => {
      screen.getByRole("button", { name: "begin" }).click();
    });

    expect(screen.getByTestId("progress")).toHaveTextContent("0");
  });

  // The console shows the whole batch, so earlier sets' transcripts stay.
  it("keeps the transcript of the sets that already ran", async () => {
    await renderBatch();

    act(() => {
      emit("pipeline-status", { kind: "step", message: "Merging exposures" });
    });
    act(() => {
      screen.getByRole("button", { name: "begin" }).click();
    });

    expect(screen.getByText("Merging exposures")).toBeInTheDocument();
  });
});
