"use client";

import { open } from "@tauri-apps/plugin-dialog";
import {
	useController,
	type Control,
	type FieldValues,
	type Path,
} from "react-hook-form";
import { Button, type ButtonProps } from "@/components/ui/button";

type TauriFileDialogFilter = {
	name: string;
	extensions: string[];
};

export type TauriFileButtonInputProps<TFieldValues extends FieldValues> = {
	control: Control<TFieldValues>;
	name: Path<TFieldValues>;
	label?: React.ReactNode;
	description?: React.ReactNode;
	multiple?: boolean;
	directory?: boolean;
	disabled?: boolean;
	filters?: TauriFileDialogFilter[];
	buttonText?: React.ReactNode;
	buttonProps?: Omit<ButtonProps, "onClick" | "type">;
};

export function TauriFileButtonInput<TFieldValues extends FieldValues>({
	control,
	name,
	multiple,
	directory,
	disabled,
	filters,
	buttonProps,
}: TauriFileButtonInputProps<TFieldValues>) {
	const { field, fieldState } = useController({ control, name });

	async function handleOpen() {
		if (disabled) return;
		const selection = await open({ multiple, directory, filters });
		if (Array.isArray(selection)) {
			field.onChange(selection);
			field.onBlur();
			return;
		}
		if (selection === null) {
			return;
		}
		field.onChange(
			directory ? [selection] : multiple ? [selection] : selection
		);
		field.onBlur();
	}

	const valueList: string[] = Array.isArray(field.value)
		? field.value
		: field.value
		? [String(field.value)]
		: [];

	return (
		<Button
			type="button"
			onClick={handleOpen}
			disabled={disabled}
			{...buttonProps}
		>
			{valueList.length > 0
				? `${valueList.length} files selected`
				: "Select files"}
		</Button>
	);
}
