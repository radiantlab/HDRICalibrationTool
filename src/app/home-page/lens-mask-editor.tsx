"use client";

import type { MotionValue } from "framer-motion";
import { Suspense, use, useId, useState } from "react";
import { GenericImage } from "@/components/ui/(image)/generic-image";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  type GenericImageMetadata,
  useGenericImageMetadata,
} from "@/lib/generic-image-metadata";
import { ScaledCircularMaskSelection } from "./fs-circular-mas-selection";

interface MaskValues {
  centerX: MotionValue<number>;
  centerY: MotionValue<number>;
  radius: MotionValue<number>;
}

/**
 * The image and its mask overlay, sized to fit the dialog.
 *
 * GenericImage renders at size-full with object-contain, so the parent decides
 * the box. If the parent does not carry the image's aspect ratio, the mask
 * container is a different shape from the pixels drawn inside it: the circle
 * lands in the wrong place and, at natural image size, off screen entirely.
 * Binding on height suits a landscape frame in a wide dialog, with max-w-full
 * as the guard for the portrait case.
 */
function MaskViewport({
  imagePath,
  thinEdge,
  values,
}: {
  imagePath: string;
  thinEdge: boolean;
  values: MaskValues;
}) {
  // Resolved by the child rather than here. A component that both builds a
  // promise and suspends on it has no committed state to remember the promise
  // by, so each retry can start again from a new one. LensMaskInput and
  // ScaledCircularMaskSelection both split it this way.
  const metadata = useGenericImageMetadata(imagePath);

  return (
    <Suspense fallback={<Spinner />}>
      <MaskViewportImage
        imagePath={imagePath}
        metadata={metadata}
        thinEdge={thinEdge}
        values={values}
      />
    </Suspense>
  );
}

function MaskViewportImage({
  imagePath,
  metadata,
  thinEdge,
  values,
}: {
  imagePath: string;
  metadata: Promise<GenericImageMetadata>;
  thinEdge: boolean;
  values: MaskValues;
}) {
  const { size } = use(metadata);

  return (
    <div
      className="h-full max-w-full"
      style={{ aspectRatio: `${size[0]} / ${size[1]}` }}
    >
      <ScaledCircularMaskSelection
        centerX={values.centerX}
        centerY={values.centerY}
        className="size-full"
        imagePath={imagePath}
        radius={values.radius}
        thinEdge={thinEdge}
      >
        <GenericImage fsSrc={imagePath} />
      </ScaledCircularMaskSelection>
    </div>
  );
}

/**
 * The lens mask at full window size.
 *
 * It drives the same MotionValue instances as the inline preview, so there is
 * no draft state to apply or discard: closing the dialog just stops showing the
 * larger view. The numeric Radius/X/Y inputs already live in LensMaskInput and
 * are not duplicated here.
 */
export function LensMaskEditor({
  centerX,
  centerY,
  imagePath,
  onOpenChange,
  open,
  radius,
}: MaskValues & {
  imagePath: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [thinEdge, setThinEdge] = useState(false);
  const edgeCheckId = useId();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex h-[90vh] w-[90vw] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle>Configure lens mask</DialogTitle>
          <DialogDescription>
            Drag the circle to move it and the handle to resize it. The Radius,
            X and Y fields in the sidebar stay in step and accept exact values.
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
          data-testid="mask-viewport"
        >
          <Suspense fallback={<Spinner />}>
            <MaskViewport
              imagePath={imagePath}
              thinEdge={thinEdge}
              values={{ centerX, centerY, radius }}
            />
          </Suspense>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            checked={thinEdge}
            id={edgeCheckId}
            onCheckedChange={(checked) => setThinEdge(Boolean(checked))}
          />
          <Label htmlFor={edgeCheckId}>
            Edge check: draw the mask as a single pixel ring
          </Label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
