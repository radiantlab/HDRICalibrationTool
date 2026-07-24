"use client";

import type { ChangeEventHandler, ComponentProps, ReactNode } from "react";
import { useCallback } from "react";
import {
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
  useController,
} from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type NativeInputType = ComponentProps<"input">["type"];

export interface ControlledFormInputFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> {
  className?: string;
  control: Control<TFieldValues>;
  description?: ReactNode;
  inputProps?: Omit<
    ComponentProps<typeof Input>,
    "id" | "value" | "onChange" | "name" | "ref"
  > & { type?: NativeInputType };
  label: ReactNode;
  name: TName;
  placeholder?: string;
  rules?: RegisterOptions<TFieldValues, TName>;
}

export function ControlledFormInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(props: ControlledFormInputFieldProps<TFieldValues, TName>) {
  const {
    control,
    name,
    label,
    description,
    placeholder,
    rules,
    className,
    inputProps,
  } = props;

  const inputType: NativeInputType | undefined = inputProps?.type;

  const { field, fieldState } = useController({ control, name, rules });

  const inputId = field.name;
  const currentValue = field.value ?? "";

  const handleChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      if (inputType === "number") {
        const raw = e.target.value;
        const parsed = raw === "" ? undefined : Number(raw);
        field.onChange(parsed);
      } else {
        field.onChange(e);
      }
    },
    [inputType, field]
  );

  // Separate known props to avoid spreading conflicts
  const { type, autoComplete, ...restInputProps } = inputProps ?? {};

  return (
    <Field className={className} data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Input
        aria-invalid={fieldState.invalid}
        autoComplete={autoComplete ?? "off"}
        id={inputId}
        name={field.name}
        onBlur={field.onBlur}
        onChange={handleChange}
        placeholder={placeholder}
        ref={field.ref}
        type={type}
        value={currentValue}
        {...restInputProps}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
    </Field>
  );
}
