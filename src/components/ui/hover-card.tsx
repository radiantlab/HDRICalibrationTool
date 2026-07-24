"use client";

import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import type * as React from "react";

import { cn } from "@/lib/utils";

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = ({
  type,
  asChild,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Trigger> & {
  ref?: React.Ref<React.ElementRef<typeof HoverCardPrimitive.Trigger>>;
}) => (
  <HoverCardPrimitive.Trigger
    asChild={asChild}
    ref={ref}
    type={asChild ? undefined : (type ?? "button")}
    {...props}
  />
);
HoverCardTrigger.displayName = HoverCardPrimitive.Trigger.displayName;

const HoverCardContent = ({
  className,
  align = "center",
  sideOffset = 4,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content> & {
  ref?: React.Ref<React.ElementRef<typeof HoverCardPrimitive.Content>>;
}) => (
  <HoverCardPrimitive.Content
    align={align}
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-[--radix-hover-card-content-transform-origin] rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    ref={ref}
    sideOffset={sideOffset}
    {...props}
  />
);
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardContent, HoverCardTrigger };
