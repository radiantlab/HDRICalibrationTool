import type { MotionValue } from "framer-motion";
import { Maximize2, MoveHorizontal, MoveVertical, Radius } from "lucide-react";
import { type ComponentProps, Suspense, use, useState } from "react";
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

export function LensMaskInput({
  maskPreviewImage,
  ...props
}: {
  centerX: MotionValue<number>;
  centerY: MotionValue<number>;
  radius: MotionValue<number>;
  maskPreviewImage?: string;

  register: UseFormRegister<pipelineConfig>;
}) {
  const maskPreviewImageMetadataPromise =
    useGenericImageMetadata(maskPreviewImage);

  return (
    <Suspense fallback={<Spinner />}>
      {maskPreviewImage && maskPreviewImageMetadataPromise ? (
        <LensMaskInputInner
          maskPreviewImage={maskPreviewImage}
          maskPreviewImageMetadataPromise={maskPreviewImageMetadataPromise}
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
  radius,
  register,
}: ComponentProps<typeof LensMaskInput> & {
  maskPreviewImage: string;
  maskPreviewImageMetadataPromise: Promise<GenericImageMetadata>;
}) {
  const maskPreviewImageMetadata = use(maskPreviewImageMetadataPromise);
  const [editorOpen, setEditorOpen] = useState(false);

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
    </div>
  );
}
