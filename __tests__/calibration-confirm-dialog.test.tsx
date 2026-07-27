import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { CalibrationConfirmDialog } from "../src/app/home-page/calibration-confirm-dialog";

const TITLE = /Not all calibration files have been uploaded/i;
const GO_BACK = /Go back/i;
const GENERATE_ANYWAY = /Generate anyway/i;
const MISSING = /missing/i;

function renderDialog(unsupplied: string[] | null) {
  const onDecision = jest.fn<(proceed: boolean) => void>();
  render(
    <CalibrationConfirmDialog onDecision={onDecision} unsupplied={unsupplied} />
  );
  return onDecision;
}

describe("CalibrationConfirmDialog", () => {
  it("stays closed when there is nothing to ask about", () => {
    renderDialog(null);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // The point of #183: the files may have been left out deliberately, so the
  // copy must not accuse the user of forgetting them.
  it("does not describe the files as missing", () => {
    renderDialog(["Camera response"]);

    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.queryByText(MISSING)).toBeNull();
  });

  it("lists the files that were left out", () => {
    renderDialog(["Vignetting correction", "Calibration factor"]);

    expect(screen.getByText("Vignetting correction")).toBeInTheDocument();
    expect(screen.getByText("Calibration factor")).toBeInTheDocument();
  });

  it("reports going back so the run is abandoned", () => {
    const onDecision = renderDialog(["Camera response"]);

    fireEvent.click(screen.getByRole("button", { name: GO_BACK }));

    expect(onDecision).toHaveBeenCalledWith(false);
  });

  it("reports proceeding so a deliberate choice is honoured", () => {
    const onDecision = renderDialog(["Camera response"]);

    fireEvent.click(screen.getByRole("button", { name: GENERATE_ANYWAY }));

    expect(onDecision).toHaveBeenCalledWith(true);
  });

  // Dismissing is not an instruction to run the pipeline.
  it("treats Escape as going back", () => {
    const onDecision = renderDialog(["Camera response"]);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onDecision).toHaveBeenCalledWith(false);
  });
});
