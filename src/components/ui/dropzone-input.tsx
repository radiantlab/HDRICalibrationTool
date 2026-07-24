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

export interface DropzoneInputProps<TFieldValues extends FieldValues> {
  accept?: Accept;
  className?: string;
  control: Control<TFieldValues>;
  description?: React.ReactNode;
  disabled?: boolean;
  label?: React.ReactNode;
  multiple?: boolean;
  name: Path<TFieldValues>;
  placeholder?: string;
}

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

  let values: unknown[];
  if (Array.isArray(field.value)) {
    values = field.value;
  } else if (field.value === null) {
    values = [];
  } else {
    values = [field.value];
  }

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
    .filter((fileName): fileName is string => !!fileName);

  return (
    <Field className={className} data-invalid={!!fieldState.error}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
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
            {fileNames.map((fileName) => (
              <li key={fileName}>{fileName}</li>
            ))}
          </ul>
        )}
        {description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
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
