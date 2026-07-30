"use client";

/**
 * Cycles light, dark and system.
 *
 * A three-way cycle rather than a two-way switch, because "follow the system"
 * is a real preference and not the same as whichever of light or dark the
 * system happens to be right now.
 */

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ThemePreference, useTheme } from "./theme-provider";

const NEXT: Record<ThemePreference, ThemePreference> = {
  dark: "system",
  light: "dark",
  system: "light",
};

const LABEL: Record<ThemePreference, string> = {
  dark: "Dark",
  light: "Light",
  system: "Follows your system",
};

const ICON: Record<ThemePreference, typeof SunIcon> = {
  dark: MoonIcon,
  light: SunIcon,
  system: MonitorIcon,
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = ICON[theme];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={`Theme: ${LABEL[theme]}. Click to change.`}
          className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => setTheme(NEXT[theme])}
          type="button"
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Theme: {LABEL[theme]}</TooltipContent>
    </Tooltip>
  );
}
