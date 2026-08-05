"use client";

import {
  type ComponentProps,
  memo,
  Suspense,
  use,
  useEffect,
  useRef,
} from "react";
import { CircularMaskSelection } from "@/components/ui/circular-mask-selection";
import { Spinner } from "@/components/ui/spinner";
import {
  type GenericImageMetadata,
  useGenericImageMetadata,
} from "@/lib/generic-image-metadata";

export const ScaledCircularMaskSelection = memo(
  function ScaledCircularMaskSelection({
    imagePath,
    ...props
  }: Omit<
    ComponentProps<typeof InnerScaledCircularMaskSelection>,
    "imageMetadata"
  > & {
    imagePath: string;
  }) {
    const imageMetadata = useGenericImageMetadata(imagePath);

    return (
      <Suspense fallback={<Spinner />}>
        <InnerScaledCircularMaskSelection
          imageMetadata={imageMetadata}
          {...props}
        />
      </Suspense>
    );
  }
);

/**
 * Renders the mask at whatever size its container happens to be.
 *
 * The mask is stored once, in image pixels, as a centre and a radius. Every
 * view derives its display values from those, so the inline preview and the
 * full-size editor cannot disagree: there is no second copy to fall out of
 * step, and no scale factor captured in a subscription closure.
 */
function InnerScaledCircularMaskSelection({
  imageMetadata,
  centerX,
  centerY,
  radius,
  ...props
}: Omit<
  ComponentProps<typeof CircularMaskSelection>,
  "imageHeight" | "imageWidth" | "onMoveCenter" | "onResize" | "ref"
> & {
  imageMetadata: Promise<GenericImageMetadata>;
}) {
  const { size } = use(imageMetadata);

  const placed = useRef(false);

  // Placing the default mask needs the image size, which is already known here,
  // and nothing else. Rendering is pure CSS percentages, so no measurement is
  // involved in getting the mask on screen at all.
  useEffect(() => {
    if (placed.current || !(size[0] > 0 && size[1] > 0)) {
      return;
    }
    placed.current = true;

    // Only place a mask that has never been placed; a user who has already
    // positioned it keeps their values.
    if (centerX.get() === 0 && centerY.get() === 0) {
      centerX.set(size[0] / 2);
      centerY.set(size[1] / 2);
      radius.set(size[1] / 4);
    }
  }, [size, centerX, centerY, radius]);

  return (
    <CircularMaskSelection
      {...props}
      centerX={centerX}
      centerY={centerY}
      imageHeight={size[1]}
      imageWidth={size[0]}
      onMoveCenter={(deltaX, deltaY) => {
        // Moving the centre leaves the radius alone, which is the point of
        // storing a radius rather than a second point.
        centerX.set(centerX.get() + deltaX);
        centerY.set(centerY.get() + deltaY);
      }}
      onResize={(nextRadius) => {
        if (nextRadius > 0) {
          radius.set(nextRadius);
        }
      }}
      radius={radius}
    />
  );
}
