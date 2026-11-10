import DxfParser from 'dxf-parser';
import type { IEllipseEntity } from 'dxf-parser/dist/entities/ellipse';
import type { ISplineEntity } from 'dxf-parser/dist/entities/spline';
import { bounds, distance, edges, EPS, makeShape, segmentsIntersect, selfIntersects, signedArea, type Point, type Ring, type Shape } from './polygon';
import { splinePath } from './spline';

export const units = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 9: .0254, 11: 1e-7, 13: .001, 14: 100, 16: 100000 } as const;
export type Unit = keyof typeof units;
export const unitLabels: [Unit, string][] = [[4,'Milimetri'],[5,'Centimetri'],[6,'Metri'],[1,'Inči'],[2,'Stope'],[9,'Milovi'],[11,'Ångströmi'],[13,'Mikrometri'],[14,'Decimetri'],[16,'Hektometri']];
export type DxfResult = {
  shape: Shape; preview: Ring[]; issues: string[]; valid: boolean; unit?: Unit; needsUnit: boolean;
};

function arc(center: Point, radius: number, start: number, sweep: number, tolerance: number): Ring {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(sweep) || Math.abs(sweep) < EPS) return [];
  const step = Math.min(Math.PI / 8, 2 * Math.acos(Math.max(-1, 1 - tolerance / radius)));
  const segments = Math.max(2, Math.ceil(Math.abs(sweep) / step));
  const count = Math.abs(Math.abs(sweep) - 2 * Math.PI) < EPS ? Math.ceil(segments / 4) * 4 : segments;
  if (count > 1200) throw new Error('Kriva zahteva više od 1.200 segmenata. Povećajte toleranciju.');
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = start + sweep * i / count;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

function polyline(vertices: (Point & { bulge?: number })[], closed: boolean, tolerance: number) {
  if (vertices.length < 2) return vertices;
  const path: Ring = [];
  for (let i = 0; i < vertices.length - Number(!closed); i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const bulge = a.bulge ?? 0;
    if (Math.abs(bulge) < EPS || distance(a, b) < EPS) { path.push(a); continue; }
    const dx = b.x - a.x, dy = b.y - a.y, offset = (1 - bulge * bulge) / (4 * bulge);
    const center = { x: (a.x + b.x) / 2 - dy * offset, y: (a.y + b.y) / 2 + dx * offset };
    path.push(...arc(center, distance(a, center), Math.atan2(a.y - center.y, a.x - center.x), 4 * Math.atan(bulge), tolerance).slice(0, -1));
  }
  path.push(closed ? vertices[0] : vertices.at(-1)!);
  return path;
}

export function parseDxf(raw: string, override?: Unit, tolerance = .15): DxfResult {
  const empty = makeShape([]);
  const invalid = (message: string): DxfResult => ({ shape: empty, preview: [], issues: [message], valid: false, needsUnit: false });
  if (!Number.isFinite(tolerance) || tolerance <= 0) return invalid('Tolerancija mora biti pozitivan broj.');
  if (!/^\s*0\s*\r?\n\s*SECTION\s*$/mi.test(raw) || !/\n\s*EOF\s*$/i.test(raw)) return invalid('Fajl nije čitljiv ASCII DXF.');
  try {
    const document = new DxfParser().parseSync(raw);
    if (!document?.entities?.length) return invalid('DXF ne sadrži geometriju za sečenje.');
    if (document.entities.length > 20000) return invalid('DXF ima više od 20.000 entiteta. Podelite crtež na delove.');
    const declared = Number(document.header?.['$INSUNITS']);
    const unit = override ?? (Object.hasOwn(units, declared) ? declared as Unit : undefined);
    const scale = unit ? units[unit] : 1;
    const issues = new Set<string>();
    if (!unit) issues.add('Jedinica nije poznata. Potvrdite jedinicu crteža.');
    const paths: Ring[] = [];
    let vertices = 0;
    const supported = new Set(['LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'SPLINE']);
    // The parser skips unknown entities. Read top-level type codes separately to report them.
    const lines = raw.trimStart().split(/\r?\n/).map(line => line.trim());
    let section = '', entityType = '';
    for (let i = 0; i < lines.length - 1; i += 2) {
      if (section === 'ENTITIES' && supported.has(entityType) &&
          ((['210','220'].includes(lines[i]) && Math.abs(Number(lines[i+1])) > EPS) ||
          (lines[i] === '230' && Math.abs(Number(lines[i+1]) - 1) > EPS) ||
          (lines[i] === '38' && Math.abs(Number(lines[i+1])) > EPS))) issues.add('Geometrija van XY ravni zahteva konverziju u 2D.');
      if (lines[i] !== '0') continue;
      const type = lines[i + 1];
      if (type === 'SECTION') section = lines[i + 3];
      else if (type === 'ENDSEC') section = '';
      else if (section === 'ENTITIES') {
        entityType = type;
        if (!supported.has(type) && !['VERTEX', 'SEQEND'].includes(type)) issues.add('Nepodržan entitet: ' + type);
      }
    }
    for (const entity of document.entities) {
      if (/^SHEET_GUIDE$/i.test(entity.layer)) continue;
      const e = entity as typeof entity & {
        vertices?: (Point & { bulge?: number; z?: number })[]; shape?: boolean; is3dPolyline?: boolean;
        includesCurveFitVertices?: boolean; includesSplineFitVertices?: boolean;
        is3dPolygonMesh?: boolean; isPolyfaceMesh?: boolean; center?: Point & { z?: number };
        radius?: number; startAngle?: number; endAngle?: number; extrusionDirection?: { x: number; y: number; z: number };
      };
      if (e.vertices?.some(p => Math.abs(p.z ?? 0) > EPS) || e.is3dPolyline || e.is3dPolygonMesh ||
          e.isPolyfaceMesh || Math.abs(e.center?.z ?? 0) > EPS ||
          (e.extrusionDirection && (Math.abs(e.extrusionDirection.x) > EPS || Math.abs(e.extrusionDirection.y) > EPS || e.extrusionDirection.z < 1 - EPS))) {
        issues.add('Geometrija van XY ravni zahteva konverziju u 2D.'); continue;
      }
      if (e.includesCurveFitVertices || e.includesSplineFitVertices) {
        issues.add('Fit polilinija zahteva konverziju u standardnu 2D poliliniju.'); continue;
      }
      let path: Ring = [];
      if (e.type === 'LINE') path = e.vertices ?? [];
      if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices) path = polyline(e.vertices, Boolean(e.shape), tolerance / scale);
      if (e.type === 'CIRCLE' && e.center && e.radius) path = arc(e.center, e.radius, 0, 2 * Math.PI, tolerance / scale);
      if (e.type === 'ARC' && e.center && e.radius && e.startAngle !== undefined && e.endAngle !== undefined) {
        const sweep = ((e.endAngle - e.startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        path = arc(e.center, e.radius, e.startAngle, sweep, tolerance / scale);
      }
      if (e.type === 'ELLIPSE') path = ellipsePath(entity as IEllipseEntity, tolerance / scale);
      if (entity.type === 'SPLINE') {
        path = splinePath(entity as ISplineEntity, tolerance / scale);
        if (!path.length) { issues.add('Nepodržan SPLINE. Potrebna je 2D kriva stepena 1–3 sa čvorovima i kontrolnim tačkama, bez racionalnih težina.'); continue; }
      }
      if (!supported.has(e.type)) { issues.add('Nepodržan entitet: ' + e.type); continue; }
      if (path.length < 2 || path.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
        issues.add('Pronađen je neispravan segment.'); continue;
      }
      vertices += path.length;
      if (vertices > 35000) return invalid('DXF ima više od 35.000 temena posle konverzije. Podelite crtež ili povećajte toleranciju.');
      paths.push(path.map(p => ({ x: p.x * scale, y: p.y * scale })).filter((p, i, points) => !i || distance(p, points[i - 1]) > EPS));
    }
    const rings: Ring[] = [];
    const open: Ring[] = [];
    const pending = [...paths];
    const joinTolerance = .005;
    const near = (a: Point, b: Point) => distance(a, b) <= joinTolerance;
    while (pending.length) {
      let path = pending.shift()!;
      if (path.length < 2) { issues.add('Pronađen je segment nulte dužine.'); continue; }
      while (!near(path[0], path.at(-1)!)) {
        const end = path.at(-1)!;
        const index = pending.findIndex(p => near(end, p[0]) || near(end, p.at(-1)!));
        if (index < 0) break;
        let next = pending.splice(index, 1)[0];
        if (!near(end, next[0])) next = [...next].reverse();
        path = path.concat(next.slice(1));
      }
      if (path.length >= 4 && near(path[0], path.at(-1)!)) {
        const ring = path.slice(0, -1);
        if (ring.length > 4000 || rings.length >= 2500) return invalid('DXF prelazi ograničenje od 4.000 temena po konturi ili 2.500 kontura.');
        if (selfIntersects(ring)) issues.add('Kontura ima samopresecanje.');
        if (Math.abs(signedArea(ring)) < EPS) issues.add('Kontura nema površinu.');
        rings.push(ring);
      } else open.push(path);
    }
    if (open.length) issues.add('Otvoreni segmenti ili konture: ' + open.length);
    if (!rings.length) issues.add('Nema zatvorenih kontura za nesting.');
    const ringEdges = rings.map(edges), boxes = rings.map(r => bounds([r]));
    for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.maxX + EPS < b.minX || b.maxX + EPS < a.minX || a.maxY + EPS < b.minY || b.maxY + EPS < a.minY) continue;
      if (rings[i].length === rings[j].length && rings[i].every(p => rings[j].some(q => near(p, q)))) issues.add('Pronađena je duplirana kontura.');
      else if (ringEdges[i].some(([p, q]) => ringEdges[j].some(([r, s]) => segmentsIntersect(p, q, r, s)))) issues.add('Konture se dodiruju ili presecaju.');
    }
    const shape = makeShape(rings);
    const previewBox = bounds(paths);
    const preview = paths.map(path => path.map(p => ({ x: p.x - previewBox.minX, y: p.y - previewBox.minY })));
    return { shape, preview, issues: [...issues], valid: !issues.size, unit, needsUnit: !unit };
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith('Kriva') ? error.message : 'DXF zapis je oštećen ili nije podržan.';
    return invalid(message);
  }
}

function ellipsePath(entity: IEllipseEntity, tolerance: number): Ring {
  const { center, majorAxisEndPoint: axis, axisRatio: ratio, startAngle: start, endAngle: end } = entity;
  if (!center || !axis || Math.abs(axis.z ?? 0) > EPS || !(ratio > 0 && ratio <= 1)) return [];
  const sweep = end - start;
  if (!(sweep > 0 && sweep <= 2 * Math.PI + EPS)) return [];
  const radius = Math.hypot(axis.x, axis.y);
  return arc({ x: 0, y: 0 }, radius, start, sweep, tolerance).map(p => ({
    x: center.x + (p.x * axis.x - p.y * ratio * axis.y) / radius,
    y: center.y + (p.x * axis.y + p.y * ratio * axis.x) / radius,
  }));
}

export function writeDxf(rings: Ring[], guide?: Ring) {
  const lines: (string | number)[] = [
    0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC',
    0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 5, '10', 330, '0', 100, 'AcDbSymbolTable', 70, 2,
    0, 'LAYER', 5, '11', 330, '10', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, 'CUT', 70, 0, 62, 7, 6, 'CONTINUOUS',
    0, 'LAYER', 5, '12', 330, '10', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, 'SHEET_GUIDE', 70, 0, 62, 8, 6, 'CONTINUOUS',
    0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES',
  ];
  const append = (ring: Ring, layer: string, index: number) => {
    lines.push(0, 'LWPOLYLINE', 5, (256 + index).toString(16).toUpperCase(), 100, 'AcDbEntity', 8, layer, 100, 'AcDbPolyline', 90, ring.length, 70, 1);
    for (const p of ring) lines.push(10, p.x.toFixed(7), 20, p.y.toFixed(7));
  };
  rings.forEach((ring,index) => append(ring, 'CUT', index));
  if (guide) append(guide, 'SHEET_GUIDE', rings.length);
  return lines.concat(0, 'ENDSEC', 0, 'EOF', '').join('\r\n');
}

