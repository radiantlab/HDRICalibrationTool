import type { MotionValue } from "framer-motion";
import { Maximize2, MoveHorizontal, MoveVertical, Radius } from "lucide-react";
import { Suspense, use, useState } from "react";
import type { UseFormRegister } from "react-hook-form";
import { GenericImage } from "@/components/ui/(image)/generic-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type GenericImageMetadata,
  useGenericImageMetadata,
} from "@/lib/generic-image-metadata";
import { cn } from "@/lib/utils";
import type { pipelineConfig } from "./(pipeline-configuration)/config-provider";
import { ScaledCircularMaskSelection } from "./fs-circular-mas-selection";
import { LensMaskEditor } from "./lens-mask-editor";

interface MaskFieldProps {
  centerX: MotionValue<number>;
  centerY: MotionValue<number>;
  radius: MotionValue<number>;

  register: UseFormRegister<pipelineConfig>;
}

/**
 * The size of the image the current mask was drawn against, when it came from
 * a preset and has not been touched since.
 *
 * The mask is three numbers in image pixels, so it only means the same thing
 * on an image of the same size. Null once the user has moved it: at that point
 * they have placed it against what they can see, and the preset's provenance
 * no longer describes it.
 */
type MaskSourceSize = [number, number] | null;

export function LensMaskInput({
  maskPreviewImage,
  maskSourceSize,
  ...props
}: MaskFieldProps & {
  maskPreviewImage?: string;
  maskSourceSize?: MaskSourceSize;
}) {
  const maskPreviewImageMetadataPromise =
    useGenericImageMetadata(maskPreviewImage);

  return (
    <Suspense fallback={<Spinner />}>
      {maskPreviewImage && maskPreviewImageMetadataPromise ? (
        <LensMaskInputInner
          maskPreviewImage={maskPreviewImage}
          maskPreviewImageMetadataPromise={maskPreviewImageMetadataPromise}
          maskSourceSize={maskSourceSize}
          {...props}
        />
      ) : (
        // The numbers stay on screen without a preview. They used to go with
        // it, so a mask applied from a preset read as absent: the run would
        // crop to a circle the configuration never showed.
        <div className="space-y-1">
          <p className="grid h-48 w-full place-items-center border-4 border-dashed text-center text-lg text-muted-foreground">
            No image selected
          </p>
          <MaskFields {...props} />
          <p className="text-muted-foreground text-xs">
            {maskSourceSize
              ? `Drawn against a ${maskSourceSize[0]}×${maskSourceSize[1]} image. `
              : ""}
            These values are applied to the run as they are. Select a preview
            image to place the mask on it.
          </p>
        </div>
      )}
    </Suspense>
  );
}

function LensMaskInputInner({
  maskPreviewImage,
  maskPreviewImageMetadataPromise,
  maskSourceSize,
  centerX,
  centerY,
  radius,
  register,
}: MaskFieldProps & {
  maskPreviewImage: string;
  maskPreviewImageMetadataPromise: Promise<GenericImageMetadata>;
  maskSourceSize?: MaskSourceSize;
}) {
  const maskPreviewImageMetadata = use(maskPreviewImageMetadataPromise);
  const [editorOpen, setEditorOpen] = useState(false);

  // Stays on screen for as long as the mismatch does. The toast raised when
  // the preset is applied cannot cover the other order -- preset first, image
  // chosen afterwards -- and there is nothing to warn about at apply time when
  // no image has been selected yet.
  const [width, height] = maskPreviewImageMetadata.size;
  const mismatched =
    maskSourceSize &&
    (maskSourceSize[0] !== width || maskSourceSize[1] !== height)
      ? maskSourceSize
      : null;

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "grid size-full place-items-center text-center text-muted-foreground",
          {
            "border border-dashed": !maskPreviewImage,
          }
        )}
        style={{
          aspectRatio: `${maskPreviewImageMetadata.size[0]} / ${maskPreviewImageMetadata.size[1]}`,
        }}
      >
        <Suspense fallback={<Spinner />}>
          <ScaledCircularMaskSelection
            centerX={centerX}
            centerY={centerY}
            className="size-full"
            imagePath={maskPreviewImage}
            radius={radius}
          >
            <GenericImage fsSrc={maskPreviewImage} />
          </ScaledCircularMaskSelection>
        </Suspense>
      </div>
      <Button
        className="w-full"
        onClick={() => setEditorOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <Maximize2 /> Edit mask at full size
      </Button>
      <LensMaskEditor
        centerX={centerX}
        centerY={centerY}
        imagePath={maskPreviewImage}
        onOpenChange={setEditorOpen}
        open={editorOpen}
        radius={radius}
      />
      <MaskFields
        centerX={centerX}
        centerY={centerY}
        radius={radius}
        register={register}
      />
      {mismatched ? (
        <p className="text-amber-600 text-xs">
          This mask was drawn against a {mismatched[0]}×{mismatched[1]} image
          and the selected one is {width}×{height}. Check it before running.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The mask as three numbers.
 *
 * Rendered whether or not a preview image is selected, so the mask is always
 * legible: it is what the run actually uses, and the preview is only a way to
 * set it.
 */
function MaskFields({ centerX, centerY, radius, register }: MaskFieldProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex gap-1">
          <Input
            icon={<Radius />}
            placeholder="Radius"
            type="number"
            {...register("lensMask.radius", {
              min: {
                message: "Radius must be greater than 0",
                value: 1,
              },
              onChange(e: React.ChangeEvent<HTMLInputElement>) {
                const n = Number(e.target.value);
                if (Number.isNaN(n)) {
                  return;
                }
                radius.set(n);
              },
              valueAsNumber: true,
            })}
            step="any"
          />
          <Input
            icon={<MoveHorizontal />}
            placeholder="X"
            type="number"
            {...register("lensMask.x", {
              onChange(e: React.ChangeEvent<HTMLInputElement>) {
                const n = Number(e.target.value);
                if (Number.isNaN(n)) {
                  return;
                }
                centerX.set(n);
              },
              valueAsNumber: true,
            })}
            step="any"
          />
          <Input
            icon={<MoveVertical />}
            placeholder="Y"
            type="number"
            {...register("lensMask.y", {
              onChange(e: React.ChangeEvent<HTMLInputElement>) {
                const n = Number(e.target.value);
                if (Number.isNaN(n)) {
                  return;
                }
                centerY.set(n);
              },
              valueAsNumber: true,
            })}
            step="any"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>Values in pixels.</TooltipContent>
    </Tooltip>
  );
}
