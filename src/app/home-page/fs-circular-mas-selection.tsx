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
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { ComponentProps } from "react";
import { MotionValue, useMotionValue } from "framer-motion";
import { Spinner } from "@/components/ui/spinner";

function useScaledMotionValues(
	a: MotionValue<number>,
	b: MotionValue<number>,
	factor = 5,
) {
	useLayoutEffect(() => {
		let isUpdating = false;

		// set a initially to sync the factor
		a.set(b.get() * factor);

		const unsubA = a.on("change", (v) => {
			if (isUpdating) return;
			isUpdating = true;
			b.set(v / factor);
			isUpdating = false;
		});

		const unsubB = b.on("change", (v) => {
			if (isUpdating) return;
			isUpdating = true;
			a.set(v * factor);
			isUpdating = false;
		});

		return () => {
			unsubA();
			unsubB();
		};
	}, [a, b, factor]);
}

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
}: Omit<ComponentProps<typeof CircularMaskSelection>, "ref"> & {
	imageMetadata: Promise<GenericImageMetadata>;
}) {
	const { size } = use(imageMetadata);

	const containerRef = useRef<HTMLDivElement>(null);
	const [scalingFactor, setScalingFactor] = useState<number>(1);

	const initialSet = useRef(false);

	const virtualCenterX = useMotionValue(0);
	const virtualCenterY = useMotionValue(0);
	const virtualRadiusAjusterCenterX = useMotionValue(0);
	const virtualRadiusAjusterCenterY = useMotionValue(0);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;

		// clientWidth is the untransformed layout width. getBoundingClientRect
		// returns the *transformed* rect, so while the dialog plays its zoom-in
		// animation it reports a scaled width and the factor comes out wrong.
		const measure = () =>
			element.clientWidth || element.getBoundingClientRect().width;

		// Placing the mask lives here rather than in the effect body so that every
		// measurement can attempt it. Gating placement on the first measurement
		// alone means a container that was not yet laid out consumes the only
		// attempt, leaving the mask at the origin with a zero-diameter circle:
		// invisible, while the fixed-size handle still renders.
		const updateScale = () => {
			const width = measure();
			const scalingFactor = width / size[0];
			setScalingFactor(scalingFactor);

			const canPlace =
				Number.isFinite(scalingFactor) &&
				scalingFactor > 0 &&
				size[0] > 0 &&
				size[1] > 0;

			if (canPlace && !initialSet.current) {
				initialSet.current = true;

				// Only place the mask if it has never been placed. A user who has
				// already dragged it keeps their values.
				if (centerX.get() === 0 && centerY.get() === 0) {
					const imageCenterX = size[0] / 2;
					const imageCenterY = size[1] / 2;

					centerX.set(imageCenterX);
					centerY.set(imageCenterY);

					// The radius is the distance from the centre to this handle, so
					// putting it one quarter-height to the right of the centre makes
					// the starting radius exactly height / 4.
					radiusAjusterCenterX.set(imageCenterX + size[1] / 4);
					radiusAjusterCenterY.set(imageCenterY);
				}
			}

			return scalingFactor;
		};

		updateScale();

		// The dialog animates in over 200ms, so a single frame is not enough for
		// the layout to settle. Re-measure across the animation; each call is a
		// cheap layout read and stops mattering once the factor stops changing.
		const frame = requestAnimationFrame(() => updateScale());
		const settle = window.setTimeout(() => updateScale(), 250);

		const resizeObserver = new ResizeObserver(() => updateScale());
		resizeObserver.observe(element);

		return () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(settle);
			resizeObserver.disconnect();
		};
	}, [size]);

	useScaledMotionValues(virtualCenterX, centerX, scalingFactor);
	useScaledMotionValues(virtualCenterY, centerY, scalingFactor);
	useScaledMotionValues(
		virtualRadiusAjusterCenterX,
		radiusAjusterCenterX,
		scalingFactor,
	);
	useScaledMotionValues(
		virtualRadiusAjusterCenterY,
		radiusAjusterCenterY,
		scalingFactor,
	);

	return (
		<CircularMaskSelection
			ref={containerRef}
			centerX={virtualCenterX}
			centerY={virtualCenterY}
			radiusAjusterCenterX={virtualRadiusAjusterCenterX}
			radiusAjusterCenterY={virtualRadiusAjusterCenterY}
			{...props}
		/>
	);
}
