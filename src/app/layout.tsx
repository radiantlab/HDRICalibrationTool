/**
 * Root layout component for the HDRI Calibration Tool application.
 *
 * This component serves as the main wrapper for all pages in the application.
 * It includes the global font settings, metadata for the app, initialization component,
 * and the navigation bar that appears on all pages.
 */
import type { Metadata } from "next";
import "./globals.css";
import Navigation from "./navigation";
import Initialization from "./init";
import { PipelineStatusProvider } from "./pipeline-status-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { NuqsAdapter } from "nuqs/adapters/next/app";

// Define metadata for the application
export const metadata: Metadata = {
	title: "HDRI Calibration Tool",
	description: "Tool for calibrating High Dynamic Range Images",
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
					"font-sans h-screen w-screen overflow-hidden flex flex-col",
				)}
			>
				{/* Initialize the application settings */}
				<Initialization />
				{/* Render the navigation bar */}
				<Navigation />
				{/* Render the current page content */}
				<Toaster position="bottom-left" />
				<NuqsAdapter>
					<PipelineStatusProvider>
						<TooltipProvider>{children}</TooltipProvider>
					</PipelineStatusProvider>
				</NuqsAdapter>
			</body>
		</html>
	);
}
