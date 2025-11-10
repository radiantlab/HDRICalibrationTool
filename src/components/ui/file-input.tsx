"use client";

import {
	type Control,
	type FieldValues,
	type FieldPathByValue,
	useController,
	RegisterOptions,
} from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { open, type DialogFilter } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";

type FilePathFieldName<T extends FieldValues> = FieldPathByValue<
	T,
	string | undefined
>;

export type FileInputProps<
	T extends FieldValues,
	TName extends FilePathFieldName<T>
> = {
	control: Control<T>;
	name: TName;
	label?: React.ReactNode;
	placeholder?: string;
	className?: string;
	buttonText?: React.ReactNode;
	/**
	 * Allow selecting a directory instead of a file.
	 */
	directory?: boolean;
	/**
	 * Tauri dialog filters.
	 */
	filters?: DialogFilter[];
	/**
	 * Disable the input and button.
	 */
	disabled?: boolean;
	rules?: Omit<RegisterOptions<T, TName>, "validate">;
};

export function FileInput<
	T extends FieldValues,
	TName extends FilePathFieldName<T>
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
}: FileInputProps<T, TName>) {
	const { field, fieldState } = useController<T, TName>({
		control,
		name,
		rules: {
			// Async validation via Tauri FS plugin.
			// If empty/undefined, treat as valid; leave required handling to caller.
			validate: async (value: unknown) => {
				const path = typeof value === "string" ? value.trim() : "";
				if (!path) return true;
				try {
					const ok = await exists(path);
					return ok || "Path does not exist";
				} catch {
					// If tauri environment not available or other error
					return "Unable to validate path";
				}
			},
			...rules,
		},
	});

	async function handleBrowse() {
		if (disabled) return;
		const selection = await open({
			multiple: false,
			directory,
			filters,
		});
		if (typeof selection === "string") {
			field.onChange(selection);
			field.onBlur();
		}
	}

	const inputId = field.name;
	const currentValue = (field.value as string | undefined) ?? "";

	return (
		<Field data-invalid={fieldState.invalid} className={className}>
			{label && <FieldLabel htmlFor={inputId}>{label}</FieldLabel>}
			<FieldContent className="flex-row items-center gap-2">
				<Input
					id={inputId}
					type="text"
					name={field.name}
					ref={field.ref}
					placeholder={placeholder}
					value={currentValue}
					onChange={(e) => field.onChange(e.target.value)}
					onBlur={field.onBlur}
					disabled={disabled}
					aria-invalid={fieldState.invalid || undefined}
				/>
				<Button
					type="button"
					variant="outline"
					onClick={handleBrowse}
					disabled={disabled}
				>
					{buttonText}
				</Button>
			</FieldContent>
			{fieldState.invalid && <FieldError errors={[fieldState.error]} />}
		</Field>
	);
}

export default FileInput;
