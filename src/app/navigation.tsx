/**
 * Navigation component for the LumiLab.
 *
 * This component provides the application's main navigation bar with links to
 * different sections of the application, and the app's name. Version numbers
 * live on the Settings page, which also reports the versions of the
 * image-processing tools.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { appInfo } from "@/lib/host/env";
import { openExternal } from "@/lib/host/open-external";
import { ThemeToggle } from "./theme-toggle";

/**
 * Main navigation component for the application
 *
 * @returns React component with navigation links and app information
 */
export default function Navigation() {
  const pathname = usePathname();

  const [appName, setAppName] = useState<string>("");

  useEffect(() => {
    // Only the name is shown here now. The versions moved to Settings, where
    // there is room to list the image-processing tools alongside them; three
    // more lines in the header would have crowded it for no gain.
    async function fetchAppInfo() {
      setAppName((await appInfo()).name);
    }

    fetchAppInfo();
  }, []);
  return (
    <nav className="z-10 w-full border-border border-b bg-card text-card-foreground">
      {/* Top header with app logo and version information */}
      <div className="h-20 w-full bg-card">
        <div className="mr-8 ml-8 flex h-full items-center justify-between border-border border-b">
          {/* Logo and app name, flush left */}
          <div className="flex min-w-0 items-center gap-3" id="logo">
            {/*
              Two files rather than one, swapped on the theme class. The mark's
              darkest blade is near-black, which measures 1.11:1 against the
              dark ground -- invisible, leaving a gap in the iris. The dark
              variant lifts the low end of the ramp so every blade is still a
              shape, and keeps the dark-to-bright reading that makes it an
              exposure bracket.

              The src is absolute. It was relative, which resolved against the
              current directory and so 404'd on /viewer/view.

              `w-10` matters as much as `h-10`. The width attribute is 512, and
              a CSS height alone does not override it, so the box stayed 512px
              wide with `object-contain` letterboxing the mark inside it. The
              logo looked right and pushed the title 524px off the left edge.
            */}
            <img
              alt=""
              className="h-10 w-10 shrink-0 dark:hidden"
              height={512}
              src="/logo/a-exposure-stack.svg"
              width={512}
            />
            <img
              alt=""
              className="hidden h-10 w-10 shrink-0 dark:block"
              height={512}
              src="/logo/a-exposure-stack-dark.svg"
              width={512}
            />
            <h1 className="truncate font-bold text-2xl">{appName}</h1>
          </div>
          {/* Theme toggle and tutorial link, flush right */}
          <div className="flex shrink-0 items-center gap-4 text-muted-foreground text-sm">
            <ThemeToggle />
            {/* The pipeline follows this tutorial step by step, and several
                fields cite its sections, so the open-access original has to be
                reachable from inside the app for those citations to be useful. */}
            <button
              className="underline hover:text-foreground"
              onClick={() =>
                openExternal(
                  "https://www.tandfonline.com/doi/full/10.1080/15502724.2019.1684319"
                )
              }
              type="button"
            >
              Luminance Maps tutorial
            </button>
          </div>
        </div>
      </div>

      {/* Navigation links */}
      <div
        className="mr-8 ml-8 flex h-12 items-center justify-around border-border border-r border-b border-l"
        id="link-container"
      >
        {/* Image Configuration page link */}
        <Link
          className={`flex h-full w-full items-center justify-center border-border border-r p-2 font-bold ${
            pathname === "/pipeline"
              ? "cursor-default bg-background" // Active page styling
              : "cursor-pointer hover:bg-accent" // Inactive page styling
          }`}
          href="/pipeline"
        >
          Image Generator
        </Link>

        {/* Settings page link */}
        <Link
          className={`flex h-full w-full items-center justify-center border-border border-r p-2 font-bold ${
            pathname === "/settings"
              ? "cursor-default bg-background"
              : "cursor-pointer hover:bg-accent"
          }`}
          href="/settings"
        >
          Settings
        </Link>

        {/* Runs page link */}
        <Link
          className={`flex h-full w-full items-center justify-center border-border border-r p-2 font-bold ${
            pathname.startsWith("/runs")
              ? "cursor-default bg-background"
              : "cursor-pointer hover:bg-accent"
          }`}
          href="/runs"
        >
          Runs
        </Link>

        {/* Image Viewer page link */}
        <Link
          className={`flex h-full w-full items-center justify-center p-2 font-bold ${
            pathname.startsWith("/viewer")
              ? "cursor-default bg-background"
              : "cursor-pointer hover:bg-accent"
          }`}
          href="/viewer"
        >
          Image Viewer
        </Link>
      </div>
    </nav>
  );
}
