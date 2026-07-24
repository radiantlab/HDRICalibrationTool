import { render, screen } from "@testing-library/react";
import Home from "../src/app/home-page/page";
import { SelectedImageProvider } from "../src/app/home-page/selected-image-context";
import { TooltipProvider } from "../src/components/ui/tooltip";

describe("Render", () => {
  it("renders the page", () => {
    render(
      <TooltipProvider>
        <SelectedImageProvider>
          <Home />
        </SelectedImageProvider>
      </TooltipProvider>
    );

    const hdri = screen.getByText("Generate HDR Image");

    expect(hdri).toBeInTheDocument();
  });
});
