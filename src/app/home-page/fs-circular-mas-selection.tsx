"use client";

import { CircularMaskSelection } from "@/components/ui/circular-mask-selection";
import {
	GenericImageMetadata,
	useGenericImageMetadata,
} from "@/lib/generic-image-metadata";
import {
	memo,
	Suspense,
	use,
	useEffect,
	useRef,
} from "react";
import { ComponentProps } from "react";
import { MotionValue, useMotionValue, useTransform } from "framer-motion";
import { Spinner } from "@/components/ui/spinner";

export const ScaledCircularMaskSelection = memo(
	function ScaledCircularMaskSelection({
		imagePath,
		...props
	}: Omit<
		ComponentProps<typeof InnserScaledCircularMaskSelection>,
		"imageMetadata"
	> & {
		imagePath: string;
	}) {
		const imageMetadata = useGenericImageMetadata(imagePath);

		return (
			<Suspense fallback={<Spinner />}>
				<InnserScaledCircularMaskSelection
					imageMetadata={imageMetadata}
					{...props}
				/>
			</Suspense>
		);
	},
);

function InnserScaledCircularMaskSelection({
	imageMetadata,
	centerX,
	centerY,
	radiusAjusterCenterX,
	radiusAjusterCenterY,
	...props
}: Omit<
	ComponentProps<typeof CircularMaskSelection>,
	"ref" | "onMoveAdjuster" | "onMoveCenter"
> & {
	imageMetadata: Promise<GenericImageMetadata>;
}) {
	const { size } = use(imageMetadata);

	const containerRef = useRef<HTMLDivElement>(null);
	const initialSet = useRef(false);

	// The scale lives in a MotionValue rather than React state so the derived
	// display values below stay correct without a re-render, and so a stale
	// factor can never be captured in a closure.
	const scale = useMotionValue(0);

	// Display values are *derived* from the image-space values. They were once
	// a second set of MotionValues kept in sync two ways, which meant the inline
	// preview and the full-size editor held competing subscriptions on the same
	// values with different factors, and a write through the wrong one produced
	// a mask positioned outside its container. A derived value cannot disagree.
	const toDisplay = ([raw, factor]: number[]) =>
		(raw as number) * (factor as number);
	const displayCenterX = useTransform<number, number>(
		[centerX, scale],
		toDisplay,
	);
	const displayCenterY = useTransform<number, number>(
		[centerY, scale],
		toDisplay,
	);
	const displayAjusterX = useTransform<number, number>(
		[radiusAjusterCenterX, scale],
		toDisplay,
	);
	const displayAjusterY = useTransform<number, number>(
		[radiusAjusterCenterY, scale],
		toDisplay,
	);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;

		// clientWidth is the untransformed layout width. getBoundingClientRect
		// returns the transformed rect, so while a dialog plays its zoom-in
		// animation it reports a scaled width and the factor comes out wrong.
		const measure = () =>
			element.clientWidth || element.getBoundingClientRect().width;

		// Placing lives inside the measurement so every measurement can attempt
		// it. Gating on the first measurement alone lets a container that was not
		// yet laid out consume the only attempt.
		const updateScale = () => {
			const width = measure();
			if (!(width > 0 && size[0] > 0 && size[1] > 0)) {
				return;
			}
			scale.set(width / size[0]);

			if (initialSet.current) {
				return;
			}
			initialSet.current = true;

			// Only place a mask that has never been placed. A user who has
			// already positioned it keeps their values.
			if (centerX.get() === 0 && centerY.get() === 0) {
				const imageCenterX = size[0] / 2;
				const imageCenterY = size[1] / 2;
				centerX.set(imageCenterX);
				centerY.set(imageCenterY);
				// The radius is the distance from the centre to this handle, so
				// one quarter-height to the right makes the radius height / 4.
				radiusAjusterCenterX.set(imageCenterX + size[1] / 4);
				radiusAjusterCenterY.set(imageCenterY);
			}
		};

		updateScale();
		// A dialog animates in over 200ms, so one frame is not enough.
		const frame = requestAnimationFrame(() => updateScale());
		const settle = window.setTimeout(() => updateScale(), 250);

		const resizeObserver = new ResizeObserver(() => updateScale());
		resizeObserver.observe(element);

		return () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(settle);
			resizeObserver.disconnect();
		};
	}, [size, centerX, centerY, radiusAjusterCenterX, radiusAjusterCenterY, scale]);

	const clamp = (value: number, min: number, max: number) =>
		Math.max(min, Math.min(max, value));

	// Drag deltas arrive in screen pixels and are applied in image pixels.
	const toImage = (delta: number) => {
		const factor = scale.get();
		return factor > 0 ? delta / factor : 0;
	};

	return (
		<CircularMaskSelection
			{...props}
			centerX={displayCenterX}
			centerY={displayCenterY}
			onMoveAdjuster={(deltaX, deltaY) => {
				radiusAjusterCenterX.set(
					clamp(radiusAjusterCenterX.get() + toImage(deltaX), 0, size[0]),
				);
				radiusAjusterCenterY.set(
					clamp(radiusAjusterCenterY.get() + toImage(deltaY), 0, size[1]),
				);
			}}
			onMoveCenter={(deltaX, deltaY) => {
				const dx = toImage(deltaX);
				const dy = toImage(deltaY);
				centerX.set(centerX.get() + dx);
				centerY.set(centerY.get() + dy);
				radiusAjusterCenterX.set(
					clamp(radiusAjusterCenterX.get() + dx, 0, size[0]),
				);
				radiusAjusterCenterY.set(
					clamp(radiusAjusterCenterY.get() + dy, 0, size[1]),
				);
			}}
			radiusAjusterCenterX={displayAjusterX}
			radiusAjusterCenterY={displayAjusterY}
			ref={containerRef}
		/>
	);
}
