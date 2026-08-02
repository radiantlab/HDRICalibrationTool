import { describe, expect, it } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";

declare const jest: typeof import("@jest/globals").jest;

jest.mock("@tauri-apps/plugin-dialog", () => ({
  open: () => Promise.resolve(null),
}));
jest.mock("@tauri-apps/plugin-fs", () => ({
  readDir: () => Promise.resolve([]),
  stat: () => Promise.resolve({ isDirectory: false, isFile: true, size: 1024 }),
}));

import {
  SelectedImageProvider,
  useSelectedImage,
} from "../src/app/home-page/selected-image-context";
import { ImageMatrixInput } from "../src/components/ui/image-matrix-input";
import type { ImageSet } from "../src/components/ui/image-set-preview";
import { TooltipProvider } from "../src/components/ui/tooltip";

interface FormValues {
  inputSets: ImageSet[];
}

// JPEGs rather than RAW files, for the same reason as `image-matrix-lock`: a
// CR2 would drag the TIFF decode worker into a test about which file stays
// selected.
const SCENE1_FIRST = "/photos/scene1/capt01.jpg";
const SCENE1_SECOND = "/photos/scene1/capt02.jpg";
const SCENE2_ONLY = "/photos/scene2/capt03.jpg";

const twoSets: ImageSet[] = [
  { files: [SCENE1_FIRST, SCENE1_SECOND], name: "scene1" },
  { files: [SCENE2_ONLY], name: "scene2" },
];

const NOTHING_SELECTED = "none";

const REMOVE_SCENE1 = /remove image set scene1/i;
const REMOVE_SCENE2 = /remove image set scene2/i;

function SelectionProbe() {
  const { selectedImage } = useSelectedImage();

  return <p data-testid="selected">{selectedImage ?? NOTHING_SELECTED}</p>;
}

function Harness() {
  const { control } = useForm<FormValues>({
    defaultValues: { inputSets: twoSets.map((set) => ({ ...set })) },
  });

  return (
    <TooltipProvider>
      <SelectedImageProvider>
        <ImageMatrixInput control={control} name="inputSets" />
        <SelectionProbe />
      </SelectedImageProvider>
    </TooltipProvider>
  );
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

async function renderPanel() {
  // The file statistics resolve through a suspended child, so the first paint
  // is awaited rather than taken synchronously.
  let view: ReturnType<typeof render> | undefined;
  await act(() => {
    view = render(<Harness />);
    return Promise.resolve();
  });
  await settle();
  if (!view) {
    throw new Error("expected the panel to render");
  }

  return view;
}

function thumbnails(container: HTMLElement): Element[] {
  // One per file, in the order the rows render them, which is each set's files
  // sorted -- the same order `onRemoveIndex` resolves against.
  return Array.from(container.querySelectorAll(".generic-image-container"));
}

function thumbnailAt(container: HTMLElement, index: number): Element {
  const thumbnail = thumbnails(container)[index];
  if (!thumbnail) {
    throw new Error(`expected a thumbnail at ${index}`);
  }

  return thumbnail;
}

async function selectThumbnail(container: HTMLElement, index: number) {
  fireEvent.click(thumbnailAt(container, index));
  await settle();
}

async function removeThumbnail(container: HTMLElement, index: number) {
  // The context menu's trigger is the thumbnail wrapper, and a contextmenu
  // event only bubbles up.
  fireEvent.contextMenu(thumbnailAt(container, index));
  await settle();
  fireEvent.click(screen.getByText("Remove image"));
  await settle();
}

function selected(): string {
  const probe = screen.getByTestId("selected").textContent;

  return probe ?? "";
}

describe("removing the file that is selected", () => {
  // Left selected, the mask preview keeps asking for the dimensions of a frame
  // the form no longer holds. For a RAW frame that is worse than stale: its
  // queued conversion is dropped along with it, so the metadata promise the
  // submit handler awaits rejects, and it is memoized on the path -- every
  // later run awaits the same permanently rejected promise.
  it("clears the selection when its whole set is removed", async () => {
    const { container } = await renderPanel();

    await selectThumbnail(container, 0);
    expect(selected()).toBe(SCENE1_FIRST);

    fireEvent.click(screen.getByRole("button", { name: REMOVE_SCENE1 }));
    await settle();

    expect(selected()).toBe(NOTHING_SELECTED);
  });

  it("clears the selection when that one frame is removed", async () => {
    const { container } = await renderPanel();

    await selectThumbnail(container, 0);
    expect(selected()).toBe(SCENE1_FIRST);

    await removeThumbnail(container, 0);

    expect(selected()).toBe(NOTHING_SELECTED);
  });
});

describe("removing a file that is not selected", () => {
  // The clear has to be as narrow as the removal, or every removal anywhere in
  // the panel would empty a preview the user is still working with.
  it("keeps the selection when another set is removed", async () => {
    const { container } = await renderPanel();

    await selectThumbnail(container, 0);

    fireEvent.click(screen.getByRole("button", { name: REMOVE_SCENE2 }));
    await settle();

    expect(selected()).toBe(SCENE1_FIRST);
  });

  it("keeps the selection when a sibling frame is removed", async () => {
    const { container } = await renderPanel();

    await selectThumbnail(container, 0);

    await removeThumbnail(container, 1);

    expect(selected()).toBe(SCENE1_FIRST);
  });
});
