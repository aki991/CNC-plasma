import { distance, type Point, type Ring } from './polygon';

type Spline = {
  controlPoints?: (Point & { z?: number })[];
  knotValues?: number[];
  degreeOfSplineCurve?: number;
  rational?: boolean;
  closed?: boolean;
};
const lerp = (a: Point, b: Point, t: number) => ({ x: a.x * (1 - t) + b.x * t, y: a.y * (1 - t) + b.y * t });

function flatten(a: Point, b: Point, c: Point, d: Point, tolerance: number, path: Ring): void {
  const dx = d.x - a.x, dy = d.y - a.y, len2 = dx * dx + dy * dy;
  const offset = (point: Point) => distance(point, lerp(a, d, len2 ? Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2)) : 0));
  if (Math.max(offset(b), offset(c)) <= tolerance) {
    if (path.length >= 1200) throw new Error('Kriva zahteva više od 1.200 segmenata. Povećajte toleranciju.');
    path.push(d);
    return;
  }
  const ab = lerp(a, b, .5), bc = lerp(b, c, .5), cd = lerp(c, d, .5);
  const abc = lerp(ab, bc, .5), bcd = lerp(bc, cd, .5), mid = lerp(abc, bcd, .5);
  flatten(a, ab, abc, mid, tolerance, path);
  flatten(mid, bcd, cd, d, tolerance, path);
}

export function splinePath(spline: Spline, tolerance: number): Ring {
  const { controlPoints: points, knotValues: knots, degreeOfSplineCurve: degree } = spline;
  if (!points || !knots || !degree || degree > 3 || degree < 1 || spline.rational ||
    knots.length !== points.length + degree + 1 || knots.some((k, i) => !Number.isFinite(k) || (i > 0 && k < knots[i - 1])) ||
    points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.z ?? 0) > 1e-7)) return [];
  const evaluate = (span: number, t: number) => {
    const work = points.slice(span - degree, span + 1);
    for (let r = 1; r <= degree; r++) for (let j = degree; j >= r; j--) {
      const i = span - degree + j;
      const gap = knots[i + degree - r + 1] - knots[i];
      work[j] = lerp(work[j - 1], work[j], gap ? (t - knots[i]) / gap : 0);
    }
    return work[degree];
  };
  const path: Ring = [];
  for (let span = degree; span < points.length; span++) {
    const start = knots[span], end = knots[span + 1];
    if (end <= start) continue;
    const a = evaluate(span, start), d = evaluate(span, end);
    if (!path.length) path.push(a);
    else if (distance(path.at(-1)!, a) > 1e-6) return [];
    // Each span is polynomial of degree at most three. Recover its cubic Bézier control points.
    const u = evaluate(span, start + (end - start) / 3);
    const v = evaluate(span, start + (end - start) * 2 / 3);
    const uX = 27 * u.x - 8 * a.x - d.x, uY = 27 * u.y - 8 * a.y - d.y;
    const vX = 27 * v.x - a.x - 8 * d.x, vY = 27 * v.y - a.y - 8 * d.y;
    const b = { x: (2 * uX - vX) / 18, y: (2 * uY - vY) / 18 };
    const c = { x: (2 * vX - uX) / 18, y: (2 * vY - uY) / 18 };
    flatten(a, b, c, d, tolerance, path);
  }
  if (spline.closed && path.length && distance(path[0], path.at(-1)!) > .005) return [];
  return path;
}

