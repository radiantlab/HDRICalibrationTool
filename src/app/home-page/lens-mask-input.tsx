import type { MotionValue } from "framer-motion";
import { MoveHorizontal, MoveVertical, Radius } from "lucide-react";
import { type ComponentProps, Suspense, use } from "react";
import type { UseFormRegister } from "react-hook-form";
import { GenericImage } from "@/components/ui/(image)/generic-image";
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

export function LensMaskInput({
  maskPreviewImage,
  ...props
}: {
  centerX: MotionValue<number>;
  centerY: MotionValue<number>;
  radiusAjusterCenterX: MotionValue<number>;
  radiusAjusterCenterY: MotionValue<number>;
  maskPreviewImage?: string;

  register: UseFormRegister<pipelineConfig>;
}) {
  return (
    <Suspense fallback={<Spinner />}>
      {maskPreviewImage ? (
        <LensMaskInputInner
          maskPreviewImage={maskPreviewImage}
          maskPreviewImageMetadataPromise={useGenericImageMetadata(
            maskPreviewImage
          )}
          {...props}
        />
      ) : (
        <p className="grid h-48 w-full place-items-center border-4 border-dashed text-lg text-muted-foreground">
          No image selected
        </p>
      )}
    </Suspense>
  );
}

function LensMaskInputInner({
  maskPreviewImage,
  maskPreviewImageMetadataPromise,
  centerX,
  centerY,
  radiusAjusterCenterX,
  radiusAjusterCenterY,
  register,
}: ComponentProps<typeof LensMaskInput> & {
  maskPreviewImage: string;
  maskPreviewImageMetadataPromise: Promise<GenericImageMetadata>;
}) {
  const maskPreviewImageMetadata = use(maskPreviewImageMetadataPromise);
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
            radiusAjusterCenterX={radiusAjusterCenterX}
            radiusAjusterCenterY={radiusAjusterCenterY}
          >
            <GenericImage fsSrc={maskPreviewImage} />
          </ScaledCircularMaskSelection>
        </Suspense>
      </div>
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
                  if (isNaN(n)) {
                    return;
                  }
                  radiusAjusterCenterX.set(centerX.get() + n);
                  radiusAjusterCenterY.set(centerY.get());
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
                  if (isNaN(n)) {
                    return;
                  }
                  const deltaX = n - centerX.get();
                  centerX.set(n);
                  radiusAjusterCenterX.set(radiusAjusterCenterX.get() + deltaX);
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
                  if (isNaN(n)) {
                    return;
                  }
                  const deltaY = n - centerY.get();
                  centerY.set(n);
                  radiusAjusterCenterY.set(radiusAjusterCenterY.get() + deltaY);
                },
                valueAsNumber: true,
              })}
              step="any"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>Values in pixels.</TooltipContent>
      </Tooltip>
    </div>
  );
}
