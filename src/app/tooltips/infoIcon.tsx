import React from "react";
import Tooltip from "./tooltip";

interface InfoIconProps {
  /** The text to display inside the tooltip bubble */
  text: string;
}

/**
 * InfoIcon renders a small gray “?” circle. On hover, it shows the `text` in a bubble.
 */
export default function InfoIcon({ text }: InfoIconProps) {
  return (
    <Tooltip content={text}>
      <span
        className="
          flex 
          items-center 
          justify-center 
          w-4 
          h-4 
          text-xs 
          font-bold 
          text-gray-600 
          bg-gray-300 
          rounded-full 
          cursor-default 
          ml-1
        "
      >
        ?
      </span>
    </Tooltip>
  );
}
