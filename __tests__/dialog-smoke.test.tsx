import { describe, expect, it } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../src/components/ui/dialog";

describe("Dialog", () => {
  it("renders nothing while closed", () => {
    render(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <p>body</p>
        </DialogContent>
      </Dialog>
    );

    expect(screen.queryByText("body")).toBeNull();
  });

  it("exposes an accessible dialog when open", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Configure lens mask</DialogTitle>
          <p>body</p>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Configure lens mask" })
    ).toBeInTheDocument();
  });
});
