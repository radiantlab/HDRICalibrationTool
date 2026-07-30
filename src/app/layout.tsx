/**
 * Root layout component for the HDRI Calibration Tool application.
 *
 * This component serves as the main wrapper for all pages in the application.
 * It includes the global font settings, metadata for the app, initialization component,
 * and the navigation bar that appears on all pages.
 */
import type { Metadata } from "next";
import "./globals.css";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import Initialization from "./init";
import Navigation from "./navigation";
import { ThemeProvider } from "./theme-provider";
import { PipelineStatusProvider } from "./pipeline-status-context";

// Define metadata for the application
export const metadata: Metadata = {
  description: "Tool for calibrating High Dynamic Range Images",
  title: "HDRI Calibration Tool",
};

/**
 * Root layout component that wraps all pages in the application.
 *
 * @param children - The child components/pages to be rendered within the layout
 * @returns The complete HTML structure for the application
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={cn(
          "flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-foreground"
        )}
      >
        <ThemeProvider>
          {/*
            TooltipProvider wraps the navigation as well as the pages. It used
            to sit inside, which meant a tooltip anywhere in the header threw
            "Tooltip must be used within TooltipProvider" -- at build time, in
            a static export, so it failed the build rather than the page.
          */}
          <TooltipProvider>
            {/* Initialize the application settings */}
            <Initialization />
            {/* Render the navigation bar */}
            <Navigation />
            <Toaster position="bottom-left" />
            <NuqsAdapter>
              <PipelineStatusProvider>
                {/*
                  Every page gets a bounded box rather than being left to size
                  itself against the viewport. The body is `h-screen
                  overflow-hidden` so the generator page can drive its own
                  resizable panels, which meant any other page taller than the
                  screen was silently clipped instead of scrolling. `min-h-0`
                  is the part that matters: without it a flex child refuses to
                  shrink below its content and hands nothing to overflow.
                */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {children}
                </div>
              </PipelineStatusProvider>
            </NuqsAdapter>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
