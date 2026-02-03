"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
	children: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class ImageViewerErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	render() {
		if (this.state.hasError) {
			return (
				<div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
					<p className="text-destructive font-medium">
						Failed to load image
					</p>
					<p className="text-sm text-muted-foreground max-w-md">
						{this.state.error?.message ?? "An unexpected error occurred."}
					</p>
					<Button
						variant="outline"
						size="sm"
						onClick={() => this.setState({ hasError: false, error: null })}
					>
						Try again
					</Button>
				</div>
			);
		}

		return this.props.children;
	}
}