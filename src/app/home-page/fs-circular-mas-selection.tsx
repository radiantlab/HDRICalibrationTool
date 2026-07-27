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

		const updateScale = () => {
			const rect = element.getBoundingClientRect();
			const scalingFactor = rect.width / size[0];
			setScalingFactor(scalingFactor);
			return scalingFactor;
		};

		// initialize on mount and when original image size changes
		const scalingFactor = updateScale();

		// Latching before the container has been laid out (width 0, so
		// scalingFactor 0) would collapse every position to 0 and strand the
		// mask in the top-left corner, with no second chance to place it.
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
				// the starting radius exactly height / 4. A circular fisheye
				// circle is bounded by the short edge, so that is a sane guess.
				radiusAjusterCenterX.set(imageCenterX + size[1] / 4);
				radiusAjusterCenterY.set(imageCenterY);
			}

			// The virtual (screen-space) values are deliberately NOT set here.
			// useScaledMotionValues holds a two-way subscription captured with
			// the scaling factor from the *previous* render, which is still the
			// initial 1 on first run. Writing a virtual value now would fire its
			// change handler and divide by that stale 1, overwriting the real
			// image-space value with a screen-space one and stranding the mask
			// near the origin. Instead, setScalingFactor below re-runs the
			// layout effect with the correct factor, which derives the virtual
			// values from the real ones in the right direction.
		}

		// The editor opens inside a dialog that animates in, so this first
		// measurement can be taken while the element is still transformed and
		// getBoundingClientRect reports a scaled or zero width. The border box
		// never changes afterwards, so the ResizeObserver below stays silent and
		// would leave the scale wrong: the mask circle collapses to nothing while
		// the fixed-size handle still renders. Re-measure once the frame settles.
		const frame = requestAnimationFrame(() => updateScale());

		const resizeObserver = new ResizeObserver(() => updateScale());
		resizeObserver.observe(element);

		return () => {
			cancelAnimationFrame(frame);
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
