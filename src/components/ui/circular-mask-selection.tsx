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

const HANDLE_RADIUS = 12;

/**
 * A draggable circle over an image.
 *
 * The mask is a centre and a radius: three numbers. An earlier version also
 * stored the handle position and derived the radius from the distance between
 * two points, which is four numbers for three degrees of freedom. The two could
 * drift apart, and every centre move had to drag the handle along in lockstep.
 * The handle position is now derived, so it cannot disagree with the radius.
 *
 * All values here are in display (CSS pixel) space. The component never writes
 * to them; it reports drags and the owner converts to image space.
 */
export function CircularMaskSelection({
  children,
  centerX,
  centerY,
  radius,
  onMoveCenter,
  onResize,
  ref,
  className,
  thinEdge,
}: {
  children: React.ReactNode;
  centerX: MotionValue<number>;
  centerY: MotionValue<number>;
  radius: MotionValue<number>;
  /** Drag deltas in CSS pixels. */
  onMoveCenter: (deltaX: number, deltaY: number) => void;
  /** The new radius in CSS pixels, derived from the handle drag. */
  onResize: (displayRadius: number) => void;
  ref?: React.RefObject<HTMLDivElement | null>;
  className?: string;
  /**
   * Draw the circle as a single pixel ring. At preview scale a 3px border
   * covers roughly 18 image pixels, which is wider than the fisheye edge being
   * aligned against.
   */
  thinEdge?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const diameter = useTransform(radius, (r) => snapToDevicePixel(r * 2));
  const left = useTransform([centerX, radius], ([cx, r]) =>
    snapToDevicePixel((cx as number) - (r as number))
  );
  const top = useTransform([centerY, radius], ([cy, r]) =>
    snapToDevicePixel((cy as number) - (r as number))
  );

  // The handle sits on the circle, to the right of the centre.
  const handleX = useTransform([centerX, radius], ([cx, r]) =>
    snapToDevicePixel((cx as number) + (r as number))
  );
  const handleY = useTransform(centerY, snapToDevicePixel);

  return (
    <div
      className={cn("group relative overflow-hidden", className)}
      ref={(element) => {
        containerRef.current = element;
        if (ref) {
          ref.current = element;
        }
      }}
    >
      <motion.div
        className={cn(
          "absolute z-10 grid place-items-center rounded-full border-red-500 hover:cursor-grab active:cursor-grabbing",
          thinEdge ? "border" : "border-3"
        )}
        drag
        dragMomentum={false}
        onDrag={(_event, info) => onMoveCenter(info.delta.x, info.delta.y)}
        style={{
          height: diameter,
          transform: useMotionTemplate`translate3d(${left}px, ${top}px, 0)`,
          width: diameter,
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
        dragMomentum={false}
        onDrag={(_event, info) => {
          // The handle sits at (cx + r, cy). After the drag it is that far
          // again plus the delta, so the new radius is the distance from the
          // centre to the moved handle.
          onResize(Math.hypot(radius.get() + info.delta.x, info.delta.y));
        }}
        style={{
          height: HANDLE_RADIUS * 2,
          transform: useMotionTemplate`translate3d(${handleX}px, ${handleY}px, 0) translate(-50%, -50%)`,
          width: HANDLE_RADIUS * 2,
        }}
      />
      {children}
    </div>
  );
}
