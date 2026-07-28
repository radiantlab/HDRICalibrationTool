import { beforeEach, describe, expect, it } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";

declare const jest: typeof import("@jest/globals").jest;

// Every file-choosing affordance in the panel goes through the dialog plugin's
// `open`, so recording its calls is how "nothing was offered" is asserted.
const openCalls: unknown[] = [];

jest.mock("@tauri-apps/plugin-dialog", () => ({
  open: (options: unknown) => {
    openCalls.push(options);
    return Promise.resolve(null);
  },
}));
jest.mock("@tauri-apps/plugin-fs", () => ({
  readDir: () => Promise.resolve([]),
  stat: () => Promise.resolve({ isDirectory: false, isFile: true, size: 1024 }),
}));

import { SelectedImageProvider } from "../src/app/home-page/selected-image-context";
import {
  ImageMatrixInput,
  type ImageSetIssue,
} from "../src/components/ui/image-matrix-input";
import type { ImageSet } from "../src/components/ui/image-set-preview";
import { TooltipProvider } from "../src/components/ui/tooltip";

interface FormValues {
  inputSets: ImageSet[];
}

// JPEGs rather than RAW files: the panel renders those through a plain <img>,
// while a CR2 would drag the TIFF decode worker into a test about buttons.
const oneSet: ImageSet[] = [
  {
    files: ["/photos/scene1/capt01.jpg", "/photos/scene1/capt02.jpg"],
    name: "scene1",
  },
];

const REMOVE_SET = /remove image set scene1/i;
const ADD_IMAGES = /add images to scene1/i;
const DROPZONE = /drag and drop images here/i;
const FILE_COUNT_LABEL = /^Files:/;

function Harness({
  disabled,
  issuesByIndex,
}: {
  disabled: boolean;
  issuesByIndex?: Partial<Record<number, ImageSetIssue>>;
}) {
  const { control, watch } = useForm<FormValues>({
    defaultValues: { inputSets: oneSet },
  });
  const sets = watch("inputSets");

  return (
    <TooltipProvider>
      <SelectedImageProvider>
        <ImageMatrixInput
          control={control}
          disabled={disabled}
          issuesByIndex={issuesByIndex}
          name="inputSets"
        />
        {/* Stands in for the field's onChange: only a change that reaches the
            form can move this number. */}
        <p data-testid="set-count">{sets?.length ?? 0}</p>
      </SelectedImageProvider>
    </TooltipProvider>
  );
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

async function renderPanel(
  disabled: boolean,
  issuesByIndex?: Partial<Record<number, ImageSetIssue>>
) {
  // The file statistics resolve through a suspended child, so the first paint
  // is awaited rather than taken synchronously.
  let view: ReturnType<typeof render> | undefined;
  await act(() => {
    view = render(
      <Harness disabled={disabled} issuesByIndex={issuesByIndex} />
    );
    return Promise.resolve();
  });
  await settle();
  if (!view) {
    throw new Error("expected the panel to render");
  }

  return view;
}

beforeEach(() => {
  openCalls.length = 0;
});

describe("ImageMatrixInput while a batch is not running", () => {
  it("offers a working remove affordance for a set", async () => {
    await renderPanel(false);

    const remove = screen.getByRole("button", { name: REMOVE_SET });
    expect(remove).toBeEnabled();

    fireEvent.click(remove);
    await settle();

    expect(screen.getByTestId("set-count").textContent).toBe("0");
  });

  it("opens the file chooser when the dropzone is clicked", async () => {
    await renderPanel(false);

    fireEvent.click(screen.getByRole("button", { name: DROPZONE }));
    await settle();

    expect(openCalls).toHaveLength(1);
  });
});

describe("ImageMatrixInput while a batch is running", () => {
  // The loop runs against the snapshot taken when Generate was pressed, and the
  // issue banners are keyed by array index, so a row that moves mid-batch would
  // collect another row's failure.
  it("keeps the remove affordance visible but inert", async () => {
    await renderPanel(true);

    const remove = screen.getByRole("button", { name: REMOVE_SET });
    expect(remove).toBeInTheDocument();
    expect(remove).toBeDisabled();

    fireEvent.click(remove);
    await settle();

    expect(screen.getByTestId("set-count").textContent).toBe("1");
  });

  it("keeps the add-images affordance visible but inert", async () => {
    await renderPanel(true);

    const add = screen.getByRole("button", { name: ADD_IMAGES });
    expect(add).toBeInTheDocument();
    expect(add).toBeDisabled();

    fireEvent.click(add);
    await settle();

    expect(openCalls).toHaveLength(0);
  });

  it("does not accept a click on the dropzone", async () => {
    await renderPanel(true);

    const dropzone = screen.getByRole("button", { name: DROPZONE });
    expect(dropzone).toBeDisabled();

    fireEvent.click(dropzone);
    await settle();

    expect(openCalls).toHaveLength(0);
  });

  // The thumbnails stay live, because looking at an image is a read, so this
  // menu can still be opened mid-batch. Its inertness rests on Radix marking
  // the item disabled, which is the same mechanism every other disabled item in
  // the app relies on. jsdom applies no Tailwind, so `pointer-events: none`
  // never lands here and a "was not called" assertion would fail against
  // correct code; the marking itself is what is worth pinning.
  it("marks the per-image remove item disabled", async () => {
    const { container } = await renderPanel(true);

    // The context menu's trigger is the inner thumbnail wrapper, not the
    // tooltip's button around it, and a contextmenu event only bubbles up.
    const thumbnail = container.querySelector(".generic-image-container");
    if (!thumbnail) {
      throw new Error("expected a thumbnail to render");
    }
    fireEvent.contextMenu(thumbnail);
    await settle();

    const item = screen.getByText("Remove image");
    expect(item).toHaveAttribute("data-disabled");
  });

  it("still shows the set and the failure it collected", async () => {
    await renderPanel(true, {
      0: {
        program: "hdrgen",
        statusCode: 1,
        stderr: "fatal",
        summary: "HDRGen could not merge this image set.",
        title: "Merge failed",
      },
    });

    expect(screen.getByText("scene1")).toBeInTheDocument();
    expect(screen.getByText("Merge failed")).toBeInTheDocument();
    expect(
      screen.getByText("HDRGen could not merge this image set.")
    ).toBeInTheDocument();
    // The file count is part of what stays readable.
    expect(screen.getByText(FILE_COUNT_LABEL)).toBeInTheDocument();
  });
});
