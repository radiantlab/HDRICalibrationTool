"use client";

import type { MotionValue } from "framer-motion";
import { Suspense, useId, useState } from "react";
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
import { ScaledCircularMaskSelection } from "./fs-circular-mas-selection";

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
  radiusAjusterCenterX,
  radiusAjusterCenterY,
}: {
  centerX: MotionValue<number>;
  centerY: MotionValue<number>;
  imagePath: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  radiusAjusterCenterX: MotionValue<number>;
  radiusAjusterCenterY: MotionValue<number>;
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

        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Suspense fallback={<Spinner />}>
            <ScaledCircularMaskSelection
              centerX={centerX}
              centerY={centerY}
              className="max-h-full max-w-full"
              imagePath={imagePath}
              radiusAjusterCenterX={radiusAjusterCenterX}
              radiusAjusterCenterY={radiusAjusterCenterY}
              thinEdge={thinEdge}
            >
              <GenericImage fsSrc={imagePath} />
            </ScaledCircularMaskSelection>
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
