export type Point = { x: number; y: number };
export type Ring = Point[];
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
export type Shape = { rings: Ring[]; depths: number[]; width: number; height: number; area: number; length: number };

export const EPS = 1e-7;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function bounds(rings: Ring[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) for (const p of ring) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function edges(ring: Ring): [Point, Point][] {
  return ring.map((p, i) => [p, ring[(i + 1) % ring.length]]);
}

export function signedArea(ring: Ring) {
  return edges(ring).reduce((sum, [a, b]) => sum + a.x * b.y - a.y * b.x, 0) / 2;
}

export function inside(point: Point, ring: Ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

const cross = (a: Point, b: Point, p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
function pointSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return pointSegment(c, a, b) < EPS || pointSegment(d, a, b) < EPS ||
    pointSegment(a, c, d) < EPS || pointSegment(b, c, d) < EPS;
}

export function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
}

export function selfIntersects(ring: Ring) {
  const segments = edges(ring);
  return segments.some(([a, b], i) => {
    const previous = ring[(i + ring.length - 1) % ring.length];
    const backtracks = Math.abs(cross(previous, a, b)) < EPS &&
      (previous.x - a.x) * (b.x - a.x) + (previous.y - a.y) * (b.y - a.y) > EPS;
    return backtracks || segments.slice(i + 2).some(([c, d], k) =>
      !(i === 0 && k + i + 2 === segments.length - 1) && segmentsIntersect(a, b, c, d));
  });
}

export function makeShape(input: Ring[]): Shape {
  if (!input.length) return { rings: [], depths: [], width: 0, height: 0, area: 0, length: 0 };
  const box = bounds(input);
  const rings = input.map(ring => ring.map(p => ({ x: p.x - box.minX, y: p.y - box.minY })));
  const depths = rings.map((ring, i) => rings.reduce((sum, other, j) => sum + Number(i !== j && inside(ring[0], other)), 0));
  return {
    rings, depths, width: box.width, height: box.height,
    area: rings.reduce((sum, ring, i) => sum + Math.abs(signedArea(ring)) * (depths[i] % 2 ? -1 : 1), 0),
    length: rings.reduce((sum, ring) => sum + edges(ring).reduce((perimeter, [a, b]) => perimeter + distance(a, b), 0), 0),
  };
}

export function rotate(rings: Ring[], degrees: number) {
  const a = degrees * Math.PI / 180;
  const raw = rings.map(ring => ring.map(p => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) })));
  const box = bounds(raw);
  return raw.map(ring => ring.map(p => ({ x: p.x - box.minX, y: p.y - box.minY })));
}

export const translate = (rings: Ring[], x: number, y: number) =>
  rings.map(ring => ring.map(p => ({ x: p.x + x, y: p.y + y })));

export const pathData = (rings: Ring[]) =>
  rings.map(ring => 'M' + ring.map(p => p.x.toFixed(3) + ',' + p.y.toFixed(3)).join('L') + 'Z').join(' ');

