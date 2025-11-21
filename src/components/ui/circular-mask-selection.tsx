import { useEffect, useRef, useState } from "react";
import {
	motion,
	MotionValue,
	useMotionTemplate,
	useTransform,
} from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function CircularMaskSelection({
	children,
	centerX,
	centerY,
	radiusAjusterCenterX,
	radiusAjusterCenterY,
	ref,
	className,
}: {
	children: React.ReactNode;
	centerX: MotionValue<number>;
	centerY: MotionValue<number>;
	radiusAjusterCenterX: MotionValue<number>;
	radiusAjusterCenterY: MotionValue<number>;
	ref?: React.RefObject<HTMLDivElement | null>;
	className?: string;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const maskRef = useRef<HTMLDivElement>(null);

	const selectorRadius = 12;

	const clamp = (value: number, min: number, max: number) =>
		Math.max(min, Math.min(max, value));

	const radius = useTransform<number, number>(
		[centerX, centerY, radiusAjusterCenterX, radiusAjusterCenterY],
		([cx, cy, rx, ry]) => Math.sqrt((cx - rx) ** 2 + (cy - ry) ** 2)
	);
	const diameter = useTransform<number, number>(radius, (r) => r * 2);

	// snap key motion values to whole pixels to avoid subpixel jitter
	const snappedCenterX = useTransform(centerX, (v) => Math.round(v));
	const snappedCenterY = useTransform(centerY, (v) => Math.round(v));
	const snappedDiameter = useTransform(diameter, (v) => Math.round(v));
	const halfDiameter = useTransform(snappedDiameter, (d) => Math.round(d / 2));
	const snappedPosX = useTransform([snappedCenterX, halfDiameter], (vals) => {
		const cx = vals[0] as number;
		const hd = vals[1] as number;
		return Math.round(cx - hd);
	});
	const snappedPosY = useTransform([snappedCenterY, halfDiameter], (vals) => {
		const cy = vals[0] as number;
		const hd = vals[1] as number;
		return Math.round(cy - hd);
	});
	return (
		<div
			ref={(r) => {
				containerRef.current = r;
				if (ref) ref.current = r;
			}}
			className={cn("relative group", className)}
		>
			<motion.div
				drag
				style={{
					width: snappedDiameter,
					height: snappedDiameter,
					transform: useMotionTemplate`translate3d(${snappedPosX}px, ${snappedPosY}px, 0)`,
					willChange: "transform, width, height",
				}}
				className="absolute rounded-full z-10 border-3 border-red-500 grid place-items-center hover:cursor-grab active:cursor-grabbing"
				dragMomentum={false}
				dragConstraints={containerRef}
				ref={maskRef}
				onDrag={(e, info) => {
					centerX.set(centerX.get() + info.delta.x);
					centerY.set(centerY.get() + info.delta.y);

					const containerRect = containerRef.current?.getBoundingClientRect();
					if (!containerRect) return;

					radiusAjusterCenterX.set(
						clamp(
							radiusAjusterCenterX.get() + info.delta.x,
							0,
							containerRect.width
						)
					);
					radiusAjusterCenterY.set(
						clamp(
							radiusAjusterCenterY.get() + info.delta.y,
							0,
							containerRect.height
						)
					);
				}}
			>
				<Plus
					className="size-8 text-red-500"
					vectorEffect="non-scaling-stroke"
					shapeRendering="crispEdges"
				/>
			</motion.div>
			<motion.div
				drag
				style={{
					transform: useMotionTemplate`translate3d(${radiusAjusterCenterX}px, ${radiusAjusterCenterY}px, 0) translate(-50%, -50%)`,
					width: selectorRadius * 2,
					height: selectorRadius * 2,
				}}
				className="absolute rounded-full bg-blue-500 z-10 opacity-0 group-hover:opacity-100 transition-opacity hover:cursor-grab active:cursor-grabbing"
				dragMomentum={false}
				onDrag={(e, info) => {
					radiusAjusterCenterX.set(radiusAjusterCenterX.get() + info.delta.x);
					radiusAjusterCenterY.set(radiusAjusterCenterY.get() + info.delta.y);
				}}
			/>
			{children}
		</div>
	);
}
