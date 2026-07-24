"use client";

import { open } from "@tauri-apps/plugin-dialog";
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
    const selection = await open({ directory, filters, multiple });
    if (Array.isArray(selection)) {
      field.onChange(selection);
      field.onBlur();
      return;
    }
    if (selection === null) {
      return;
    }
    field.onChange(directory || multiple ? [selection] : selection);
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
