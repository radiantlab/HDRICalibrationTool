import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { ImageSelectionProvider } from "../src/app/image-viewer/view/image-selection-context";
import type { LuminanceSummary } from "../src/app/image-viewer/view/luminance-aggregates";
import { SelectionDetails } from "../src/app/image-viewer/view/selection-details";
import { TooltipProvider } from "../src/components/ui/tooltip";

const MASK_NOTE = /outside the lens circle/i;
const CHART_ONLY = /chart only/i;
const STATS_UNAFFECTED = /statistics above include them/i;
const FENCE_RULE = /1\.5×IQR/;
const OLD_OUTLIER_LABEL = /^Outliers$/;

function makeSummary(overrides: Partial<LuminanceSummary> = {}) {
  return {
    average: 12.5,
    histogram: [{ count: 4, end: 20, start: 10 }],
    histogramMaximum: 20,
    histogramMinimum: 10,
    maskApplied: false,
    maximum: 20,
    median: 12,
    minimum: 10,
    outlierCount: 0,
    sampleCount: 4,
    standardDeviation: 3.5,
    ...overrides,
  } satisfies LuminanceSummary;
}

function renderDetails(overrides: Partial<LuminanceSummary> = {}) {
  return render(
    <TooltipProvider>
      <ImageSelectionProvider>
        <SelectionDetails luminanceSummary={makeSummary(overrides)} />
      </ImageSelectionProvider>
    </TooltipProvider>
  );
}

describe("SelectionDetails mask note", () => {
  it("says the readings exclude the masked corners when the mask applied", () => {
    renderDetails({ maskApplied: true });

    expect(screen.getByText(MASK_NOTE)).toBeInTheDocument();
  });

  it("shows no such note when every pixel was counted", () => {
    renderDetails({ maskApplied: false });

    expect(screen.queryByText(MASK_NOTE)).toBeNull();
  });
});

describe("SelectionDetails histogram exclusion note", () => {
  const withOutliers = { outlierCount: 61_486, sampleCount: 788_000 };

  it("reports the count and share that the chart range leaves out", () => {
    renderDetails(withOutliers);

    const note = screen.getByText(CHART_ONLY);
    expect(note.textContent).toContain("61486");
    expect(note.textContent).toContain("7.8%");
  });

  it("says the exclusion is the chart's alone and names the rule", () => {
    renderDetails(withOutliers);

    const note = screen.getByText(CHART_ONLY);
    expect(note.textContent).toMatch(STATS_UNAFFECTED);
    expect(note.textContent).toMatch(FENCE_RULE);
  });

  it("sits with the chart rather than in the list of statistics", () => {
    const { container } = renderDetails(withOutliers);

    const chart = container.querySelector("svg");
    const note = screen.getByText(CHART_ONLY);
    if (!chart) {
      throw new Error("expected the histogram chart to render");
    }
    // Node.DOCUMENT_POSITION_FOLLOWING: the note comes after the chart.
    expect(chart.compareDocumentPosition(note) & 4).toBeTruthy();
    expect(screen.queryByText(OLD_OUTLIER_LABEL)).toBeNull();
  });

  it("stays silent when the fence excluded nothing", () => {
    renderDetails({ outlierCount: 0, sampleCount: 788_000 });

    expect(screen.queryByText(CHART_ONLY)).toBeNull();
  });
});
