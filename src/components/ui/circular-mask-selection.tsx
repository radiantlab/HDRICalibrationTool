import {
  type MotionValue,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { Plus } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

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
  imageWidth,
  imageHeight,
  onMoveCenter,
  onResize,
  ref,
  className,
  thinEdge,
}: {
  children: React.ReactNode;
  /** Image-space values, in source pixels. */
  centerX: MotionValue<number>;
  centerY: MotionValue<number>;
  radius: MotionValue<number>;
  imageWidth: number;
  imageHeight: number;
  /** Drag deltas already converted to image pixels. */
  onMoveCenter: (deltaX: number, deltaY: number) => void;
  /** The new radius in image pixels, derived from the handle drag. */
  onResize: (radiusInImagePixels: number) => void;
  /** Accepts a callback ref so the owner can react to the element attaching. */
  ref?: React.Ref<HTMLDivElement>;
  className?: string;
  /**
   * Draw the circle as a single pixel ring. At preview scale a 3px border
   * covers roughly 18 image pixels, which is wider than the fisheye edge being
   * aligned against.
   */
  thinEdge?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Sinks for framer's drag gesture. Without them the gesture also translates
  // the element, on top of the left/top below that already follow the pointer,
  // so it travels at double speed and the two handles drift apart. Passing
  // external drag values keeps the gesture and leaves positioning to us.
  const dragSinkX = useMotionValue(0);
  const dragSinkY = useMotionValue(0);

  // Everything is expressed as a percentage of the container, which the browser
  // resolves at layout time. Nothing here depends on JavaScript having measured
  // the container first, so the mask cannot collapse to the origin because a
  // measurement was taken too early, or never taken at all.
  const percentX = (value: number) => `${(value / imageWidth) * 100}%`;
  const percentY = (value: number) => `${(value / imageHeight) * 100}%`;

  const width = useTransform(radius, (r) => percentX(r * 2));
  const left = useTransform([centerX, radius], ([cx, r]) =>
    percentX((cx as number) - (r as number))
  );
  const top = useTransform([centerY, radius], ([cy, r]) =>
    percentY((cy as number) - (r as number))
  );

  // The handle sits on the circle, to the right of the centre.
  const handleLeft = useTransform([centerX, radius], ([cx, r]) =>
    percentX((cx as number) + (r as number))
  );
  const handleTop = useTransform(centerY, (cy) => percentY(cy));

  /** Source pixels per CSS pixel, read at interaction time when layout is settled. */
  const imagePixelsPerCssPixel = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? imageWidth / rect.width : 0;
  };

  return (
    <div
      className={cn("group relative select-none overflow-hidden", className)}
      ref={(element) => {
        containerRef.current = element;
        if (typeof ref === "function") {
          ref(element);
        } else if (ref) {
          ref.current = element;
        }
      }}
    >
      <motion.div
        _dragX={dragSinkX}
        _dragY={dragSinkY}
        className={cn(
          "absolute z-10 grid place-items-center rounded-full border-red-500 hover:cursor-grab active:cursor-grabbing",
          thinEdge ? "border" : "border-3"
        )}
        drag
        dragMomentum={false}
        onDrag={(_event, info) => {
          const perCss = imagePixelsPerCssPixel();
          onMoveCenter(info.delta.x * perCss, info.delta.y * perCss);
        }}
        style={{
          // A square box: the height follows the width in pixels, so the circle
          // stays round whatever the container's aspect ratio.
          aspectRatio: 1,
          left,
          top,
          width,
        }}
      >
        <Plus
          className="size-8 text-red-500"
          shapeRendering="crispEdges"
          vectorEffect="non-scaling-stroke"
        />
      </motion.div>
      <motion.div
        _dragX={dragSinkX}
        _dragY={dragSinkY}
        className="absolute z-10 rounded-full bg-blue-500 opacity-0 transition-opacity hover:cursor-grab active:cursor-grabbing group-hover:opacity-100"
        drag
        dragMomentum={false}
        onDrag={(_event, info) => {
          // The handle sits at (cx + r, cy). After the drag it is that far
          // again plus the delta, so the new radius is the distance from the
          // centre to the moved handle.
          const perCss = imagePixelsPerCssPixel();
          onResize(
            Math.hypot(
              radius.get() + info.delta.x * perCss,
              info.delta.y * perCss
            )
          );
        }}
        style={{
          height: HANDLE_RADIUS * 2,
          left: handleLeft,
          top: handleTop,
          transform: "translate(-50%, -50%)",
          width: HANDLE_RADIUS * 2,
        }}
      />
      {children}
    </div>
  );
}
