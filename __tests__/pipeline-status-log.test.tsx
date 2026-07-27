import { describe, expect, it } from "@jest/globals";
import { act, render, screen } from "@testing-library/react";

// Captures the listener the provider registers so the test can push events.
const listeners: Record<string, (event: { payload: unknown }) => void> = {};

jest.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: (event: { payload: unknown }) => void) => {
    listeners[name] = handler;
    return Promise.resolve(() => undefined);
  },
}));

declare const jest: typeof import("@jest/globals").jest;

import {
  PipelineStatusProvider,
  usePipelineStatus,
} from "../src/app/pipeline-status-context";

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

function emit(name: string, payload: unknown) {
  const handler = listeners[name];
  if (!handler) {
    throw new Error(`no listener registered for ${name}`);
  }
  handler({ payload });
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
