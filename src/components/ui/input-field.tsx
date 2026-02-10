"use client";

import * as React from "react";
import {
	Controller,
	type Control,
	type FieldPath,
	type FieldValues,
	type RegisterOptions,
} from "react-hook-form";

import { Input } from "@/components/ui/input";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";

type NativeInputType = React.ComponentProps<"input">["type"];

export type ControlledFormInputFieldProps<
	TFieldValues extends FieldValues,
	TName extends FieldPath<TFieldValues>
> = {
	control: Control<TFieldValues>;
	name: TName;
	label: React.ReactNode;
	description?: React.ReactNode;
	placeholder?: string;
	rules?: RegisterOptions<TFieldValues, TName>;
	className?: string;
	inputProps?: Omit<
		React.ComponentProps<typeof Input>,
		"id" | "value" | "onChange" | "name" | "ref"
	> & { type?: NativeInputType };
};

export function ControlledFormInputField<
	TFieldValues extends FieldValues,
	TName extends FieldPath<TFieldValues>
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

	return (
		<Controller
			name={name}
			control={control}
			rules={rules}
			render={({ field, fieldState }) => {
				const inputId = field.name;
				const currentValue =
					inputType === "number" ? field.value ?? "" : field.value ?? "";

				const handleChange: React.ChangeEventHandler<HTMLInputElement> = (
					e
				) => {
					if (inputType === "number") {
						const raw = e.target.value;
						const parsed = raw === "" ? undefined : Number(raw);
						field.onChange(parsed);
					} else {
						field.onChange(e);
					}
				};

				// Separate known props to avoid spreading conflicts
				const { type, autoComplete, ...restInputProps } = inputProps ?? {};

				return (
					<Field data-invalid={fieldState.invalid} className={className}>
						<FieldLabel htmlFor={inputId}>{label}</FieldLabel>
						<Input
							id={inputId}
							aria-invalid={fieldState.invalid}
							placeholder={placeholder}
							autoComplete={autoComplete ?? "off"}
							type={type}
							name={field.name}
							ref={field.ref}
							value={currentValue}
							onChange={handleChange}
							onBlur={field.onBlur}
							{...restInputProps}
						/>
						{description && <FieldDescription>{description}</FieldDescription>}
						{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
					</Field>
				);
			}}
		/>
	);
}

export default ControlledFormInputField;
