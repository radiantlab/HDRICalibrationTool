import React, { ReactNode } from "react";

interface TooltipProps {
  /** The text (or React node) to render inside the bubble */
  content: ReactNode;
  /** The “trigger” element (e.g. an icon) over which the user hovers */
  children: ReactNode;
}

/**
 * Tooltip wraps any “trigger” (children). On hover (or focus), it shows `content`
 * in a small bubble to the right of the trigger. Uses Tailwind’s `group-hover`
 * classes to toggle visibility.
 */
export default function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className="relative inline-block group">
      {/* This is the trigger (e.g. the “?” icon) */}
      {children}

      {/* This is the bubble, hidden by default (opacity-0).
          On .group:hover → opacity-100 */}
      <span
        className="
          absolute 
          left-full 
          top-1/2 
          ml-1 
          min-w-[30ch]
          max-w-[70ch]
          whitespace-pre-line
          bg-gray-200
          text-gray-800 
          text-xs 
          font-normal
          rounded 
          px-2 
          py-1 
          opacity-0 
          group-hover:opacity-100 
          transform 
          -translate-y-1/2 
          pointer-events-none 
          transition-opacity
          z-50
        "
      >
        {content}
      </span>
    </span>
  );
}
