"use client";

import type { DialogFilter } from "@tauri-apps/plugin-dialog";
import { pickDirectoryFiles, pickFiles } from "@/lib/host/pick";
import { anyFileExists } from "@/lib/host-fs-tauri";
import {
  type Control,
  type FieldPathByValue,
  type FieldValues,
  type RegisterOptions,
  useController,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FilePathFieldName<T extends FieldValues> = FieldPathByValue<
  T,
  string | null
>;

export interface FileInputProps<
  T extends FieldValues,
  TName extends FilePathFieldName<T>,
> {
  buttonText?: React.ReactNode;
  className?: string;
  control: Control<T>;
  /**
   * Allow selecting a directory instead of a file.
   */
  directory?: boolean;
  /**
   * Disable the input and button.
   */
  disabled?: boolean;
  /**
   * When true, renders a "None" button that explicitly sets the field to null.
   */
  explicitOptional?: boolean;
  /**
   * Tauri dialog filters.
   */
  filters?: DialogFilter[];
  label?: React.ReactNode;
  name: TName;
  placeholder?: string;
  rules?: Omit<
    RegisterOptions<T, TName>,
    "validate" | "setValueAs" | "required"
  > & { required?: string };
}

export function FileInput<
  T extends FieldValues,
  TName extends FilePathFieldName<T>,
>({
  control,
  name,
  label,
  placeholder,
  className,
  buttonText = "Select…",
  directory,
  filters,
  disabled,
  rules,
  explicitOptional,
}: FileInputProps<T, TName>) {
  const { required: incomingRequired, ...rulesWithoutRequired } = rules ?? {};

  const { field, fieldState } = useController<T, TName>({
    control,
    name,
    rules: {
      // Async validation via Tauri FS plugin.
      // If empty/undefined, treat as valid; leave required handling to caller.
      validate: async (value: unknown) => {
        if (typeof value !== "string") {
          if (value === null && explicitOptional) {
            return true;
          }
          return incomingRequired;
        }

        const path = value.trim();
        try {
          // Virtual too: a preset supplies paths that exist in storage rather
          // than on disk, and reporting those as missing would be wrong.
          const ok = await anyFileExists(path);
          return ok || "Path does not exist";
        } catch {
          // If tauri environment not available or other error
          return "Unable to validate path";
        }
      },
      ...rulesWithoutRequired,
    },
  });

  async function handleBrowse() {
    if (disabled) {
      return;
    }
    // A directory selection yields its files rather than the directory, so
    // this control takes the first: it holds a single path, and in a browser
    // there is no directory path to hold.
    const [selection] = directory
      ? await pickDirectoryFiles({ filters })
      : await pickFiles({ filters, multiple: false });
    if (selection) {
      field.onChange(selection);
      field.onBlur();
    }
  }

  const inputId = field.name;
  const isNoneSelected = field.value === null;
  const currentValue = typeof field.value === "string" ? field.value : "";

  return (
    <Field className={className} data-invalid={fieldState.invalid}>
      {label ? <FieldLabel htmlFor={inputId}>{label}</FieldLabel> : null}
      <FieldContent className="flex-row items-center gap-2">
        <Input
          aria-invalid={fieldState.invalid || undefined}
          disabled={disabled}
          id={inputId}
          name={field.name}
          onBlur={field.onBlur}
          onChange={(e) => {
            if (e.target.value === "") {
              field.onChange(null);
            } else {
              field.onChange(e.target.value);
            }
          }}
          placeholder={placeholder}
          ref={field.ref}
          type="text"
          value={currentValue}
        />
        <Button
          disabled={disabled}
          onClick={handleBrowse}
          type="button"
          variant="outline"
        >
          {buttonText}
        </Button>
        {explicitOptional ? (
          <Button
            aria-pressed={isNoneSelected}
            className={cn({
              "pointer-events-none": isNoneSelected,
            })}
            disabled={disabled}
            onClick={() => {
              field.onChange(null);
              field.onBlur();
            }}
            type="button"
            variant={isNoneSelected ? "default" : "ghost"}
          >
            {"None"}
          </Button>
        ) : null}
      </FieldContent>
      {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  );
}
