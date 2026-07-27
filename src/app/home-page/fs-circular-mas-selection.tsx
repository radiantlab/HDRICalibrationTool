"use client";

import { useMotionValue, useTransform } from "framer-motion";
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
  "ref" | "onMoveCenter" | "onResize"
> & {
  imageMetadata: Promise<GenericImageMetadata>;
}) {
  const { size } = use(imageMetadata);

  const containerRef = useRef<HTMLDivElement>(null);
  const placed = useRef(false);

  // Kept in a MotionValue rather than React state so the derived values below
  // update without a re-render, and so no stale factor can be captured.
  const scale = useMotionValue(0);

  const scaled = ([value, factor]: number[]) =>
    (value as number) * (factor as number);
  const displayCenterX = useTransform<number, number>([centerX, scale], scaled);
  const displayCenterY = useTransform<number, number>([centerY, scale], scaled);
  const displayRadius = useTransform<number, number>([radius, scale], scaled);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    // clientWidth is the untransformed layout width. getBoundingClientRect
    // returns the transformed rect, so while a dialog plays its zoom-in
    // animation it reports a scaled width and the factor comes out wrong.
    const measure = () =>
      element.clientWidth || element.getBoundingClientRect().width;

    // Placing lives inside the measurement so every measurement can attempt it.
    // Gating on the first one alone lets a container that has not been laid out
    // consume the only attempt.
    const update = () => {
      const width = measure();
      if (!(width > 0 && size[0] > 0 && size[1] > 0)) {
        return;
      }
      scale.set(width / size[0]);

      if (placed.current) {
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
    };

    update();
    // A dialog animates in over 200ms, so one frame is not enough.
    const frame = requestAnimationFrame(update);
    const settle = window.setTimeout(update, 250);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(element);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      resizeObserver.disconnect();
    };
  }, [size, centerX, centerY, radius, scale]);

  const toImage = (delta: number) => {
    const factor = scale.get();
    return factor > 0 ? delta / factor : 0;
  };

  return (
    <CircularMaskSelection
      {...props}
      centerX={displayCenterX}
      centerY={displayCenterY}
      onMoveCenter={(deltaX, deltaY) => {
        // Moving the centre leaves the radius alone, which is the point of
        // storing a radius rather than a second point.
        centerX.set(centerX.get() + toImage(deltaX));
        centerY.set(centerY.get() + toImage(deltaY));
      }}
      onResize={(nextDisplayRadius) => {
        const next = toImage(nextDisplayRadius);
        if (next > 0) {
          radius.set(next);
        }
      }}
      radius={displayRadius}
      ref={containerRef}
    />
  );
}
