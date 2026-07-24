"use client";

import {
  ArrowDownOnSquareIcon,
  ArrowDownOnSquareStackIcon,
} from "@heroicons/react/24/solid";
import Dropzone, { type Accept } from "react-dropzone";
import {
  type Control,
  type FieldValues,
  type Path,
  useController,
} from "react-hook-form";
import type { pipelineConfig } from "@/app/home-page/(pipeline-configuration)/config-provider";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";

function isFile(value: unknown): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

export type DropzoneInputProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  label?: React.ReactNode;
  description?: React.ReactNode;
  accept?: Accept;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

export function DropzoneInput<
  TFieldValues extends Pick<pipelineConfig, "inputSets">,
>({
  control,
  name,
  label,
  description,
  accept,
  multiple,
  disabled,
  className,
  placeholder = "Drag and drop files here, or click to select",
}: DropzoneInputProps<TFieldValues>) {
  const { field, fieldState } = useController({ control, name });

  const values: unknown[] = Array.isArray(field.value)
    ? field.value
    : field.value == null
      ? []
      : [field.value];

  const fileNames = values
    .map((value) => {
      if (isFile(value)) {
        return value.name;
      }
      if (typeof value === "string") {
        return value;
      }
      if (value && typeof value === "object" && "name" in value) {
        const maybeName = (value as { name?: unknown }).name;
        if (typeof maybeName === "string") {
          return maybeName;
        }
      }
      return null;
    })
    .filter((name): name is string => !!name);

  return (
    <Field className={className} data-invalid={!!fieldState.error}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <FieldContent>
        <Dropzone
          accept={accept}
          disabled={disabled}
          multiple={multiple}
          onDrop={(acceptedFiles) => {
            field.onChange(
              multiple ? acceptedFiles : (acceptedFiles[0] ?? null)
            );
            field.onBlur();
          }}
        >
          {({ getRootProps, getInputProps, isDragActive }) => (
            <div
              {...getRootProps({
                className: cn(
                  "grid size-full cursor-pointer place-items-center border-8 border-dashed p-4 text-border transition-colors focus:outline-hidden",
                  { "border-foreground text-foreground": isDragActive },
                  { "cursor-not-allowed opacity-50": disabled }
                ),
              })}
            >
              <input {...getInputProps()} />
              <div className="grid place-items-center gap-2">
                {multiple ? (
                  <ArrowDownOnSquareStackIcon className="size-16" />
                ) : (
                  <ArrowDownOnSquareIcon className="size-16" />
                )}
                <p>{placeholder}</p>
              </div>
            </div>
          )}
        </Dropzone>
        {fileNames.length > 0 && (
          <ul className="mt-2 text-sm">
            {fileNames.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        )}
        {description && <FieldDescription>{description}</FieldDescription>}
        <FieldError
          errors={
            fieldState.error
              ? [{ message: fieldState.error.message as string }]
              : undefined
          }
        />
      </FieldContent>
    </Field>
  );
}
