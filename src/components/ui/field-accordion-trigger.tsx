"use client";

import * as React from "react";
import { AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { type FieldPath, useFormState } from "react-hook-form";
import {
	type pipelineConfig,
	usePipelineConfig,
} from "@/app/home-page/(pipeline-configuration)/config-provider";

export type FieldContainerAccordionTriggerProps = Omit<
	React.ComponentProps<typeof AccordionTrigger>,
	"className"
> & {
	fields: ReadonlyArray<FieldPath<pipelineConfig>>;
	className?: string;
};

export function FieldContainerAccordionTrigger({
	fields,
	className,
	children,
	...props
}: FieldContainerAccordionTriggerProps) {
	const form = usePipelineConfig();
	const { errors } = useFormState({
		control: form.control,
		name: fields, // narrow subscriptions to these fields
	});

	const hasError = React.useMemo(() => {
		function getNested(obj: unknown, path: string) {
			return path.split(".").reduce<any>((acc, key) => {
				if (!acc || typeof acc !== "object") return undefined;
				return (acc as any)[key];
			}, obj as any);
		}
		return fields.some((name) => {
			const err = getNested(errors, name);
			return !!err;
		});
	}, [errors, fields]);

	return (
		<AccordionTrigger
			className={cn(
				"text-xl font-bold",
				hasError && "text-destructive [&>svg]:text-destructive",
				className
			)}
			{...props}
		>
			{children}
		</AccordionTrigger>
	);
}

export default FieldContainerAccordionTrigger;
