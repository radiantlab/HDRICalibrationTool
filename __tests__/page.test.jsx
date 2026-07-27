import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import Home from "../src/app/home-page/page";
import { SelectedImageProvider } from "../src/app/home-page/selected-image-context";
import { PipelineStatusProvider } from "../src/app/pipeline-status-context";
import { TooltipProvider } from "../src/components/ui/tooltip";

describe("Render", () => {
  it("renders the page", () => {
    render(
      <TooltipProvider>
        <PipelineStatusProvider>
          <SelectedImageProvider>
            <Home />
          </SelectedImageProvider>
        </PipelineStatusProvider>
      </TooltipProvider>
    );

    const hdri = screen.getByText("Generate HDR Image");

    expect(hdri).toBeInTheDocument();
  });
});
