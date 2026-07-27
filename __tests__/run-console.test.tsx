import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";

jest.mock("../src/app/pipeline-status-context", () => ({
  usePipelineStatus: () => ({
    clearLog: () => undefined,
    lastEmittedOutput: { path: "/out/2026-07-27.hdr" },
    log: [
      {
        at: "2026-07-27T12:04:31.000Z",
        kind: "step",
        message: "Merging exposures",
        step: "merge_exposures",
      },
      {
        at: "2026-07-27T12:05:02.000Z",
        kind: "warning",
        message: "vignetting.cal is fixed size",
        step: "cal_check",
      },
    ],
    payload: null,
    progress: 62,
    setIndex: 1,
    setTotal: 3,
    statusText: "Applying vignetting correction",
  }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
}));

declare const jest: typeof import("@jest/globals").jest;

const SET_LINE = /Set 1 of 3/;

import { RunConsole } from "../src/app/home-page/run-console";

describe("RunConsole", () => {
  it("shows every log entry, not just the newest", () => {
    render(<RunConsole onOpenChange={() => undefined} open />);

    expect(screen.getByText("Merging exposures")).toBeInTheDocument();
    expect(screen.getByText("vignetting.cal is fixed size")).toBeInTheDocument();
  });

  it("reports which set of how many is running", () => {
    render(<RunConsole onOpenChange={() => undefined} open />);

    expect(screen.getByText(SET_LINE)).toBeInTheDocument();
  });

  it("exposes the log as an accessible live region", () => {
    render(<RunConsole onOpenChange={() => undefined} open />);

    expect(screen.getByRole("log")).toBeInTheDocument();
  });
});
