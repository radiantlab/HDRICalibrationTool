"use client";

import { pickDirectoryFiles, pickFiles } from "@/lib/host/pick";
import {
  type Control,
  type FieldValues,
  type Path,
  useController,
} from "react-hook-form";
import { Button, type ButtonProps } from "@/components/ui/button";

interface TauriFileDialogFilter {
  extensions: string[];
  name: string;
}

export interface TauriFileButtonInputProps<TFieldValues extends FieldValues> {
  buttonProps?: Omit<ButtonProps, "onClick" | "type">;
  buttonText?: React.ReactNode;
  control: Control<TFieldValues>;
  description?: React.ReactNode;
  directory?: boolean;
  disabled?: boolean;
  filters?: TauriFileDialogFilter[];
  label?: React.ReactNode;
  multiple?: boolean;
  name: Path<TFieldValues>;
}

export function TauriFileButtonInput<TFieldValues extends FieldValues>({
  control,
  name,
  multiple,
  directory,
  disabled,
  filters,
  buttonProps,
}: TauriFileButtonInputProps<TFieldValues>) {
  const { field, fieldState: _fieldState } = useController({ control, name });

  async function handleOpen() {
    if (disabled) {
      return;
    }
    // Directory picking returns the files inside rather than the directory
    // itself: a browser cannot produce a directory path, and every caller
    // enumerated it immediately anyway.
    const selection = directory
      ? await pickDirectoryFiles({ filters })
      : await pickFiles({ filters, multiple });
    if (selection.length === 0) {
      return;
    }
    field.onChange(directory || multiple ? selection : selection[0]);
    field.onBlur();
  }

  let valueList: string[];
  if (Array.isArray(field.value)) {
    valueList = field.value;
  } else if (field.value) {
    valueList = [String(field.value)];
  } else {
    valueList = [];
  }

  return (
    <Button
      disabled={disabled}
      onClick={handleOpen}
      type="button"
      {...buttonProps}
    >
      {valueList.length > 0
        ? `${valueList.length} files selected`
        : "Select files"}
    </Button>
  );
}
