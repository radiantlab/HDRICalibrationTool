import { describe, expect, it } from "@jest/globals";
import { render } from "@testing-library/react";
import { motionValue } from "framer-motion";
import { CircularMaskSelection } from "../src/components/ui/circular-mask-selection";

function renderMask(thinEdge: boolean) {
  const { container } = render(
    <CircularMaskSelection
      centerX={motionValue(100)}
      centerY={motionValue(100)}
      imageHeight={200}
      imageWidth={300}
      onMoveCenter={() => undefined}
      onResize={() => undefined}
      radius={motionValue(50)}
      thinEdge={thinEdge}
    >
      <div />
    </CircularMaskSelection>
  );
  const circle = container.querySelector(".rounded-full");
  if (!circle) {
    throw new Error("expected the mask circle to render");
  }
  return circle;
}

describe("CircularMaskSelection edge", () => {
  it("draws a thick border by default", () => {
    expect(renderMask(false).className).toContain("border-3");
  });

  it("draws a single pixel ring in edge-check mode", () => {
    const { className } = renderMask(true);

    expect(className).toContain("border");
    expect(className).not.toContain("border-3");
  });
});
