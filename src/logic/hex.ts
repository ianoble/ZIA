/**
 * Axial coordinates for hex grid (pointy-top).
 * See: https://www.redblobgames.com/grids/hexagons/#coordinates-axial
 */

export interface AxialCoord {
	q: number;
	r: number;
}

/** Neighbors in pointy-top axial: E, SE, SW, W, NW, NE */
const AXIAL_NEIGHBOR_DELTAS: AxialCoord[] = [
	{ q: 1, r: 0 },   // E
	{ q: 1, r: -1 },  // SE
	{ q: 0, r: -1 },  // SW
	{ q: -1, r: 0 },  // W
	{ q: -1, r: 1 },  // NW
	{ q: 0, r: 1 },   // NE
];

export function axialKey(coord: AxialCoord): string {
	return `${coord.q},${coord.r}`;
}

export function axialFromKey(key: string): AxialCoord {
	const [q, r] = key.split(',').map(Number);
	return { q, r };
}

export function axialNeighbors(coord: AxialCoord): AxialCoord[] {
	return AXIAL_NEIGHBOR_DELTAS.map((d) => ({ q: coord.q + d.q, r: coord.r + d.r }));
}

/** Axial distance (number of steps along the grid). */
export function axialDistance(a: AxialCoord, b: AxialCoord): number {
	const dq = Math.abs(a.q - b.q);
	const dr = Math.abs(a.r - b.r);
	return Math.max(dq, dr, dq + dr);
}

/** Check if two axial coords are adjacent (distance 1). */
export function axialAdjacent(a: AxialCoord, b: AxialCoord): boolean {
	return axialDistance(a, b) === 1;
}

/** Pointy-top hex: pixel position for center of hex. size = half-height (distance from center to corner). */
export function axialToPixel(coord: AxialCoord, size: number): { x: number; y: number } {
	const sqrt3 = Math.sqrt(3);
	return {
		x: size * sqrt3 * (coord.q + coord.r / 2),
		y: size * (3 / 2) * coord.r,
	};
}
