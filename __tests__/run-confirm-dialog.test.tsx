import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  describeRunConfirmation,
  type RunConfirmation,
  RunConfirmDialog,
} from "../src/app/home-page/run-confirm-dialog";

const TITLE = /Not all calibration files have been uploaded/i;
const GO_BACK = /Go back/i;
const GENERATE_ANYWAY = /Generate anyway/i;
const GENERATE_ALL = /Generate all/i;
const MISSING = /missing/i;
const SHARED = /same settings/i;
const BATCH_TITLE = /Generate 4 HDR images\?/i;
const LENS_MASK = /Lens mask/i;
const VIEW_ANGLES = /view angles/i;
const TARGET_RESOLUTION = /Target resolution/i;
const CALIBRATION_FILES = /Calibration files/i;

function renderDialog(confirmation: RunConfirmation | null) {
  const onDecision = jest.fn<(proceed: boolean) => void>();
  render(
    <RunConfirmDialog confirmation={confirmation} onDecision={onDecision} />
  );
  return onDecision;
}

function oneSetMissing(unsupplied: string[]): RunConfirmation {
  return { setCount: 1, unsupplied };
}

describe("RunConfirmDialog, one set", () => {
  it("stays closed when there is nothing to ask about", () => {
    renderDialog(null);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // The point of #183: the files may have been left out deliberately, so the
  // copy must not accuse the user of forgetting them.
  it("does not describe the files as missing", () => {
    renderDialog(oneSetMissing(["Camera response"]));

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.queryByText(MISSING)).toBeNull();
    expect(
      screen.getByText(
        "Did you mean to not upload them all, or do you want to go back?"
      )
    ).toBeInTheDocument();
  });

  it("lists the files that were left out", () => {
    renderDialog(
      oneSetMissing(["Vignetting correction", "Calibration factor"])
    );

    expect(screen.getByText("Vignetting correction")).toBeInTheDocument();
    expect(screen.getByText("Calibration factor")).toBeInTheDocument();
  });

  it("reports going back so the run is abandoned", () => {
    const onDecision = renderDialog(oneSetMissing(["Camera response"]));

    fireEvent.click(screen.getByRole("button", { name: GO_BACK }));

    expect(onDecision).toHaveBeenCalledWith(false);
  });

  it("reports proceeding so a deliberate choice is honoured", () => {
    const onDecision = renderDialog(oneSetMissing(["Camera response"]));

    fireEvent.click(screen.getByRole("button", { name: GENERATE_ANYWAY }));

    expect(onDecision).toHaveBeenCalledWith(true);
  });

  // Dismissing is not an instruction to run the pipeline.
  it("treats Escape as going back", () => {
    const onDecision = renderDialog(oneSetMissing(["Camera response"]));

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onDecision).toHaveBeenCalledWith(false);
  });

  // One set with everything supplied must not gain a prompt it never had.
  it("says nothing about shared settings", () => {
    renderDialog(oneSetMissing(["Camera response"]));

    expect(screen.queryByText(SHARED)).toBeNull();
  });
});

describe("RunConfirmDialog, several sets", () => {
  it("says how many sets will run and that the settings are shared", () => {
    renderDialog({ setCount: 4, unsupplied: [] });

    expect(screen.getByText(BATCH_TITLE)).toBeInTheDocument();
    expect(screen.getByText(SHARED)).toBeInTheDocument();
    expect(screen.getByText(LENS_MASK)).toBeInTheDocument();
    expect(screen.getByText(VIEW_ANGLES)).toBeInTheDocument();
    expect(screen.getByText(TARGET_RESOLUTION)).toBeInTheDocument();
    expect(screen.getByText(CALIBRATION_FILES)).toBeInTheDocument();
  });

  it("confirms with a label that matches what is about to happen", () => {
    const onDecision = renderDialog({ setCount: 4, unsupplied: [] });

    fireEvent.click(screen.getByRole("button", { name: GENERATE_ALL }));

    expect(onDecision).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("button", { name: GENERATE_ANYWAY })).toBeNull();
  });

  // Answering two prompts to start one run is what this dialog exists to
  // avoid, so both concerns appear together and #183's wording survives.
  it("asks about calibration in the same dialog, in the agreed words", () => {
    renderDialog({ setCount: 4, unsupplied: ["Camera response"] });

    expect(screen.getByText(SHARED)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Not all calibration files have been uploaded. Did you mean to not upload them all, or do you want to go back?"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Camera response")).toBeInTheDocument();
  });
});

describe("describeRunConfirmation", () => {
  it("has nothing to ask about one complete set", () => {
    expect(describeRunConfirmation(1, [])).toBeNull();
  });

  it("asks about one set with a calibration file left out", () => {
    expect(describeRunConfirmation(1, ["Camera response"])).toEqual({
      setCount: 1,
      unsupplied: ["Camera response"],
    });
  });

  it("asks about several complete sets", () => {
    expect(describeRunConfirmation(3, [])).toEqual({
      setCount: 3,
      unsupplied: [],
    });
  });

  it("asks about several sets with a calibration file left out", () => {
    expect(describeRunConfirmation(3, ["Camera response"])).toEqual({
      setCount: 3,
      unsupplied: ["Camera response"],
    });
  });
});
