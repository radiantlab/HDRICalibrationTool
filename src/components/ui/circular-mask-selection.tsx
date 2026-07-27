import {
  type MotionValue,
  motion,
  useMotionTemplate,
  useTransform,
} from "framer-motion";
import { Plus } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

const snapToDevicePixel = (value: number) => {
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.round(value * dpr) / dpr;
};

export function CircularMaskSelection({
  children,
  centerX,
  centerY,
  radiusAjusterCenterX,
  radiusAjusterCenterY,
  ref,
  className,
  thinEdge,
  onMoveCenter,
  onMoveAdjuster,
}: {
  children: React.ReactNode;
  centerX: MotionValue<number>;
  centerY: MotionValue<number>;
  radiusAjusterCenterX: MotionValue<number>;
  radiusAjusterCenterY: MotionValue<number>;
  ref?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  /**
   * Draw the circle as a single pixel ring. At preview scale a 3px border
   * covers roughly 18 image pixels, which is wider than the fisheye edge the
   * user is aligning against.
   */
  thinEdge?: boolean;
  /** Screen-space drag deltas. The caller owns the underlying values. */
  onMoveCenter: (deltaX: number, deltaY: number) => void;
  onMoveAdjuster: (deltaX: number, deltaY: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);

  const selectorRadius = 12;

  const radius = useTransform<number, number>(
    [centerX, centerY, radiusAjusterCenterX, radiusAjusterCenterY],
    ([cx, cy, rx, ry]) =>
      Math.sqrt(
        ((cx as number) - (rx as number)) ** 2 +
          ((cy as number) - (ry as number)) ** 2
      )
  );
  const diameter = useTransform<number, number>(radius, (r) => r * 2);

  const snappedDiameter = useTransform(diameter, snapToDevicePixel);
  const snappedRadiusAjusterCenterX = useTransform(
    radiusAjusterCenterX,
    snapToDevicePixel
  );
  const snappedRadiusAjusterCenterY = useTransform(
    radiusAjusterCenterY,
    snapToDevicePixel
  );

  const snappedPosX = useTransform([centerX, snappedDiameter], (vals) => {
    const cx = vals[0] as number;
    const d = vals[1] as number;
    return snapToDevicePixel(cx - d / 2);
  });
  const snappedPosY = useTransform([centerY, snappedDiameter], (vals) => {
    const cy = vals[0] as number;
    const d = vals[1] as number;
    return snapToDevicePixel(cy - d / 2);
  });
  return (
    <div
      className={cn("group relative overflow-hidden", className)}
      ref={(r) => {
        containerRef.current = r;
        if (ref) {
          ref.current = r;
        }
      }}
    >
      <motion.div
        className={cn(
          "absolute z-10 grid place-items-center rounded-full border-red-500 hover:cursor-grab active:cursor-grabbing",
          thinEdge ? "border" : "border-3"
        )}
        drag
        dragConstraints={containerRef}
        dragMomentum={false}
        onDrag={(_e, info) => onMoveCenter(info.delta.x, info.delta.y)}
        ref={maskRef}
        style={{
          height: snappedDiameter,
          transform: useMotionTemplate`translate3d(${snappedPosX}px, ${snappedPosY}px, 0)`,
          width: snappedDiameter,
          willChange: "transform, width, height",
        }}
      >
        <Plus
          className="size-8 text-red-500"
          shapeRendering="crispEdges"
          vectorEffect="non-scaling-stroke"
        />
      </motion.div>
      <motion.div
        className="absolute z-10 rounded-full bg-blue-500 opacity-0 transition-opacity hover:cursor-grab active:cursor-grabbing group-hover:opacity-100"
        drag
        dragConstraints={containerRef}
        dragMomentum={false}
        onDrag={(_e, info) => onMoveAdjuster(info.delta.x, info.delta.y)}
        style={{
          height: selectorRadius * 2,
          transform: useMotionTemplate`translate3d(${snappedRadiusAjusterCenterX}px, ${snappedRadiusAjusterCenterY}px, 0) translate(-50%, -50%)`,
          width: selectorRadius * 2,
        }}
      />
      {children}
    </div>
  );
}
