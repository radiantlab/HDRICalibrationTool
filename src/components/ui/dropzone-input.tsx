"use client";

import Dropzone, { type Accept } from "react-dropzone";
import {
	useController,
	type Control,
	type FieldValues,
	type Path,
} from "react-hook-form";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
	ArrowDownOnSquareIcon,
	ArrowDownOnSquareStackIcon,
} from "@heroicons/react/24/solid";
import { pipelineConfig } from "@/app/home-page/(pipeline-configuration)/config-provider";

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
	TFieldValues extends Pick<pipelineConfig, "inputSets">
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

	const files: File[] = Array.isArray(field.value)
		? field.value
		: field.value
		? [field.value as File]
		: [];

	return (
		<Field data-invalid={!!fieldState.error} className={className}>
			{label && <FieldLabel>{label}</FieldLabel>}
			<FieldContent>
				<Dropzone
					onDrop={(acceptedFiles) => {
						field.onChange(multiple ? acceptedFiles : acceptedFiles[0] ?? null);
						field.onBlur();
					}}
					accept={accept}
					multiple={multiple}
					disabled={disabled}
				>
					{({ getRootProps, getInputProps, isDragActive }) => (
						<div
							{...getRootProps({
								className: cn(
									"transition-colors border-8 border-dashed text-border size-full grid place-items-center p-4 cursor-pointer focus:outline-none",
									{ "text-foreground border-foreground": isDragActive },
									{ "opacity-50 cursor-not-allowed": disabled }
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
				{files.length > 0 && (
					<ul className="mt-2 text-sm">
						{files.map((f, i) => (
							<li key={i}>{f.name}</li>
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
