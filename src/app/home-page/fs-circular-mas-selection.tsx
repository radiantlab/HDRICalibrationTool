"use client";

import { CircularMaskSelection } from "@/components/ui/circular-mask-selection";
import {
	GenericImageMetadata,
	useGenericImageMetadata,
} from "@/lib/generic-image-metadata";
import { memo, Suspense, use, useEffect, useRef, useState } from "react";
import { ComponentProps } from "react";
import { MotionValue, useMotionValue } from "framer-motion";
import { Spinner } from "@/components/ui/spinner";

function useScaledMotionValues(
	a: MotionValue<number>,
	b: MotionValue<number>,
	factor = 5
) {
	// prevent feedback loops
	let isUpdating = false;

	useEffect(() => {
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
	}
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

		const updateScale = () => {
			const rect = element.getBoundingClientRect();
			const scalingFactor = rect.width / size[0];
			setScalingFactor(scalingFactor);
			return scalingFactor;
		};

		// initialize on mount and when original image size changes
		const scalingFactor = updateScale();
		if (!initialSet.current) {
			initialSet.current = true;

			let initialCenterX = centerX.get() * scalingFactor;
			let initialCenterY = centerY.get() * scalingFactor;
			let initialRadiusAjusterCenterX =
				radiusAjusterCenterX.get() * scalingFactor;
			let initialRadiusAjusterCenterY =
				radiusAjusterCenterY.get() * scalingFactor;

			const applyDefaultValues = initialCenterX === 0 && initialCenterY === 0;
			// dont check these, since it wont be zero because of the clamp constraint
			// initialRadiusAjusterCenterX === 0 &&
			// initialRadiusAjusterCenterY === 0;
			if (applyDefaultValues) {
				const imageCenterX = size[0] / 2;
				const imageCenterY = size[1] / 2;
				const defaultCenterX = imageCenterX;
				centerX.set(defaultCenterX);
				initialCenterX = defaultCenterX * scalingFactor;

				const defaultCenterY = imageCenterY;
				centerY.set(defaultCenterY);
				initialCenterY = defaultCenterY * scalingFactor;

				const defaultRadiusAjusterCenterX = imageCenterX + size[0] * 0.25;
				radiusAjusterCenterX.set(defaultRadiusAjusterCenterX);
				initialRadiusAjusterCenterX =
					defaultRadiusAjusterCenterX * scalingFactor;

				const defaultRadiusAjusterCenterY = imageCenterY + size[1] * 0.25;
				radiusAjusterCenterY.set(defaultRadiusAjusterCenterY);
				initialRadiusAjusterCenterY =
					defaultRadiusAjusterCenterY * scalingFactor;
			}

			virtualCenterX.set(initialCenterX);
			virtualCenterY.set(initialCenterY);
			virtualRadiusAjusterCenterX.set(initialRadiusAjusterCenterX);
			virtualRadiusAjusterCenterY.set(initialRadiusAjusterCenterY);
		}

		const resizeObserver = new ResizeObserver(() => updateScale());
		resizeObserver.observe(element);

		return () => {
			resizeObserver.disconnect();
		};
	}, [size]);

	useScaledMotionValues(virtualCenterX, centerX, scalingFactor);
	useScaledMotionValues(virtualCenterY, centerY, scalingFactor);
	useScaledMotionValues(
		virtualRadiusAjusterCenterX,
		radiusAjusterCenterX,
		scalingFactor
	);
	useScaledMotionValues(
		virtualRadiusAjusterCenterY,
		radiusAjusterCenterY,
		scalingFactor
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
