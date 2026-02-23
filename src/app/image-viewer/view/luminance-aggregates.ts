import type { ImageRectSelection } from "./image-selection-context";
import type { FalsecolorLuminanceMatrix } from "./falsecolor-luminance-webgpu";

export type LuminanceAggregates = {
	sampleCount: number;
	average: number | null;
	median: number | null;
};

const EMPTY_AGGREGATES: LuminanceAggregates = {
	sampleCount: 0,
	average: null,
	median: null,
};

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

type RegionBounds = {
	startX: number;
	startY: number;
	endX: number;
	endY: number;
};

function resolveRegionBounds(
	matrix: FalsecolorLuminanceMatrix,
	selection: ImageRectSelection | null
): RegionBounds {
	if (!selection) {
		return {
			startX: 0,
			startY: 0,
			endX: matrix.width,
			endY: matrix.height,
		};
	}

	const startX = clamp(Math.floor(selection.x), 0, matrix.width);
	const startY = clamp(Math.floor(selection.y), 0, matrix.height);
	const endX = clamp(Math.ceil(selection.x + selection.width), 0, matrix.width);
	const endY = clamp(Math.ceil(selection.y + selection.height), 0, matrix.height);

	return { startX, startY, endX, endY };
}

export function computeLuminanceAggregates(
	matrix: FalsecolorLuminanceMatrix | null,
	selection: ImageRectSelection | null
): LuminanceAggregates {
	if (!matrix) return EMPTY_AGGREGATES;

	const bounds = resolveRegionBounds(matrix, selection);
	const regionWidth = bounds.endX - bounds.startX;
	const regionHeight = bounds.endY - bounds.startY;

	if (regionWidth <= 0 || regionHeight <= 0) return EMPTY_AGGREGATES;

	const expectedSamples = regionWidth * regionHeight;
	const values = new Float32Array(expectedSamples);
	let sampleIndex = 0;
	let sum = 0;

	for (let y = bounds.startY; y < bounds.endY; y += 1) {
		const rowOffset = y * matrix.width;
		for (let x = bounds.startX; x < bounds.endX; x += 1) {
			const luminance = matrix.values[rowOffset + x] ?? 0;
			values[sampleIndex] = luminance;
			sum += luminance;
			sampleIndex += 1;
		}
	}

	if (sampleIndex === 0) return EMPTY_AGGREGATES;

	values.sort();
	const midpoint = Math.floor(sampleIndex / 2);
	const median =
		sampleIndex % 2 === 0
			? ((values[midpoint - 1] ?? 0) + (values[midpoint] ?? 0)) / 2
			: (values[midpoint] ?? 0);

	return {
		sampleCount: sampleIndex,
		average: sum / sampleIndex,
		median,
	};
}

