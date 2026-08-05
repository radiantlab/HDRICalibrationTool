"use client";

import { type ComponentProps, useMemo } from "react";
import { type FieldPath, useFormState } from "react-hook-form";
import {
  type pipelineConfig,
  usePipelineConfig,
} from "@/app/pipeline/(pipeline-configuration)/config-provider";
import { AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export type FieldContainerAccordionTriggerProps = Omit<
  ComponentProps<typeof AccordionTrigger>,
  "className"
> & {
  fields: readonly FieldPath<pipelineConfig>[];
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

  const hasError = useMemo(() => {
    function getNested(obj: unknown, path: string): unknown {
      return path
        .split(".")
        .reduce<unknown>(
          (acc, key) =>
            acc && typeof acc === "object"
              ? (acc as Record<string, unknown>)[key]
              : undefined,
          obj
        );
    }
    return fields.some((name) => {
      const err = getNested(errors, name);
      return !!err;
    });
  }, [errors, fields]);

  return (
    <AccordionTrigger
      className={cn(
        "font-bold text-lg",
        hasError && "text-destructive [&>svg]:text-destructive",
        className
      )}
      {...props}
    >
      {children}
    </AccordionTrigger>
  );
}
